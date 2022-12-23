import * as core from '@actions/core'
import { RunScriptStepArgs } from 'hooklib/lib'
import { containerExecStep } from '../dockerCommands'
import { runDockerCommand } from '../utils'
import { exit } from 'process'

export async function runScriptStep(
  args: RunScriptStepArgs,
  state
): Promise<void> {
  // Check that it was attempting to run the drone script
  if (args.entryPoint !== 'sh' || args.entryPointArgs[0] !== '-e') {
    core.error('must run a script')
    exit(1)
  }

  args.entryPointArgs[1] = '/tmp/drone.sh'
  args.workingDirectory = '/tmp'

  const dockerArgs: string[] = [
    'cp',
    '/scripts/drone.sh',
    state.container.concat(':/tmp/drone.sh')
  ]
  await runDockerCommand(dockerArgs)
  await containerExecStep(args, state.container)
}
