/*
Copyright © 2019 Nick Bourdakos <bourdakos1@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
package cmd

import (
	"github.com/cloud-annotations/training/cacli/cmd/tensorboard"
	"github.com/spf13/cobra"
)

// tensorboardCmd represents the tensorboard command
var tensorboardCmd = &cobra.Command{
	Use:   "tensorboard <model-id>",
	Short: "Start TensorBoard for a training run",
	Long: `TensorBoard is a suite of web applications for inspecting and understanding
your TensorFlow runs and graphs. https://github.com/tensorflow/tensorboard.

Basic Example:
  cacli tensorboard MODEL-ID`,
	Run: tensorboard.Run,
}

func init() {
	rootCmd.AddCommand(tensorboardCmd)
}
