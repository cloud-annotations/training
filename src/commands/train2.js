const { dim, bold, red, green } = require('chalk')
const WML = require('./../api/wml')
const progress = require('./../commands/progress')
const login = require('./../commands/login')
const input = require('./../utils/input')
const stringLength = require('./../utils/stringLength')
const stringToBool = require('./../utils/stringToBool')
const optionsParse = require('./../utils/optionsParse')
const Spinner = require('./../utils/spinner')
const picker = require('./../utils/picker')
const COS = require('ibm-cos-sdk')
const cosEndpointBuilder = require('./../utils/cosEndpointBuilder')
const ConfigBuilder = require('./../utils/configBuilder')
const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const request = require('request-promise-native')

const toBase64 = str => Buffer.from(str, 'utf8').toString('base64')

async function listBuckets({ region, access_key_id, secret_access_key }) {
  const config = {
    endpoint: cosEndpointBuilder(region, true),
    accessKeyId: access_key_id,
    secretAccessKey: secret_access_key
  }
  const cos = new COS.S3(config)
  return await cos
    .listBuckets()
    .promise()
    .then(data =>
      data.Buckets.map(bucket => {
        return bucket.Name
      })
    )
}

async function checkRegion(
  { region, access_key_id, secret_access_key },
  bucket
) {
  const config = {
    endpoint: cosEndpointBuilder(region, true),
    accessKeyId: access_key_id,
    secretAccessKey: secret_access_key
  }
  const cos = new COS.S3(config)
  try {
    const region = await cos
      .getBucketLocation({ Bucket: bucket })
      .promise()
      .then(data => data.LocationConstraint)
    if (region) {
      return true
    }
    return false
  } catch {
    return false
  }
}

module.exports = async options => {
  const parser = optionsParse()
  parser.add('training_zip')
  parser.add(['--gpu'])
  parser.add(['--steps'])
  parser.add([true, 'help', '--help', '-help', '-h'])
  const ops = parser.parse(options)

  if (ops.help) {
    console.log('cacli train [<zip_file>]')
    return process.exit()
  }

  const config = new ConfigBuilder()
  if (ops.gpu) {
    config.setGPU(ops.gpu)
  }
  if (ops.steps) {
    config.setSteps(ops.steps)
  }

  const spinner = new Spinner()

  // ///////////////////////////////////////////////////////////////////////////
  const CREDENTIAL_PATH = path.join(os.homedir(), '.cacli', 'credentials.json')
  const rawCredentials = JSON.parse(fs.readFileSync(CREDENTIAL_PATH, 'utf8'))

  spinner.setMessage('Checking login...')
  spinner.start()
  // try to refresh the token.
  const baseEndpoint = 'cloud.ibm.com'
  const endpointsEndpoint = `https://iam.${baseEndpoint}/identity/.well-known/openid-configuration`
  const identityEndpoints = await request({
    url: endpointsEndpoint,
    method: 'GET',
    json: true
  })
  const tokenEndpoint = identityEndpoints.token_endpoint
  try {
    const refreshedToken = await request({
      url: tokenEndpoint,
      method: 'POST',
      headers: {
        Authorization: `Basic ${toBase64('bx:bx')}`
      },
      form: {
        grant_type: 'refresh_token',
        refresh_token: rawCredentials.refresh_token
      },
      json: true
    })
    spinner.stop()

    rawCredentials.access_token = refreshedToken.access_token
    rawCredentials.refresh_token = refreshedToken.refresh_token

    fs.outputFileSync(CREDENTIAL_PATH, JSON.stringify(rawCredentials))
  } catch {
    spinner.stop()
    await login(['--sso'])
  }

  const safeCredentials = JSON.parse(fs.readFileSync(CREDENTIAL_PATH, 'utf8'))
  // TODO: fix the region
  const credentials = {
    wml: {
      instance_id: safeCredentials.machine_learning_instance.guid,
      access_token: safeCredentials.access_token,
      url: `https://${safeCredentials.machine_learning_instance.region_id}.ml.cloud.ibm.com`
    },
    cos: {
      access_key_id:
        safeCredentials.object_storage_instance.credentials.cos_hmac_keys
          .access_key_id,
      secret_access_key:
        safeCredentials.object_storage_instance.credentials.cos_hmac_keys
          .secret_access_key,
      region: 'us'
    }
  }

  // ///////////////////////////////////////////////////////////////////////////

  spinner.setMessage('Loading buckets...')
  spinner.start()

  // Get list of buckets
  let buckets
  try {
    buckets = await listBuckets(credentials.cos)
    spinner.stop()
  } catch (e) {
    spinner.stop()
    console.error(`${red('error')} Invalid object storage credentials.`)
    return process.exit(1)
  }

  // Check if there is at least 1 bucket.
  if (buckets.length === 0) {
    console.error(`${red('error')} No buckets exist.`)
    return process.exit(1)
  }

  const i = Math.max(0, buckets.indexOf(config.trainingBucket()))

  let trainingBucket = buckets[0]
  if (buckets.length > 1) {
    trainingBucket = await picker(
      `training data location: ${dim('(Use arrow keys and enter to choose)')}`,
      buckets,
      {
        default: i
      }
    )
  }

  config.setTrainingBucket(trainingBucket)
  console.log(`training data location: ${config.trainingBucket()}`)
  console.log()

  spinner.setMessage('Checking bucket...')
  spinner.start()

  const validTraining = await checkRegion(
    credentials.cos,
    config.trainingBucket()
  )

  spinner.stop()

  if (!validTraining) {
    console.error(
      `${red('error')} The selected training bucket is not in the region \`${
        credentials.cos.region
      }\`.`
    )
    return process.exit(1)
  }

  config.setName(config.trainingBucket())

  const finalizedConfig = config.config
  finalizedConfig.credentials = credentials

  spinner.setMessage('Starting training run...')
  spinner.start()
  const wml = new WML(finalizedConfig)
  const modelId = await wml.startTraining(ops.training_zip)
  spinner.stop()
  console.log(`${green('success')} Training run submitted.`)
  console.log()

  console.log('Model ID:')
  console.log(`┌─${'─'.repeat(stringLength(modelId))}─┐`)
  console.log(`│ ${bold.cyan(modelId)} │`)
  console.log(`└─${'─'.repeat(stringLength(modelId))}─┘`)
  console.log()

  const shouldMonitor = stringToBool(
    await input(`Would you like to monitor progress? `, 'yes')
  )

  if (shouldMonitor) {
    console.log()
    await progress([modelId], finalizedConfig)
  }
}

const dirtyFatalCatcher = func => {
  try {
    func()
  } catch (e) {
    console.error(e)
    process.exit(0)
  }
}