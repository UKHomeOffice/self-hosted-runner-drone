import * as core from '@actions/core'
import * as io from '@actions/io'
import * as k8s from '@kubernetes/client-node'
import {
  ContextPorts,
  prepareJobArgs,
  writeToResponseFile,
  getFileContents
} from 'hooklib'
import path from 'path'
import {
  containerPorts,
  createPod,
  createConfigMap,
  isPodContainerAlpine,
  prunePods,
  pruneConfigMaps,
  waitForPodPhases
} from '../k8s'
import {
  DEFAULT_CONTAINER_ENTRY_POINT,
  DEFAULT_CONTAINER_ENTRY_POINT_ARGS,
  PodPhase
} from '../k8s/utils'
import { JOB_CONTAINER_NAME } from './constants'

export async function prepareJob(
  args: prepareJobArgs,
  responseFile
): Promise<void> {
  if (!args.container) {
    throw new Error('Job Container is required.')
  }

  await prunePods()
  await pruneConfigMaps()
  await copyExternalsToRoot()
  let container: k8s.V1Container | undefined = undefined
  if (args.container?.image) {
    // eslint-disable-next-line no-useless-escape
    if (!/^alpine\/curl(?:\:.+)?$/.test(args.container.image)) {
      throw new Error('image must be alpine/curl')
    }
    core.debug(`Using image '${args.container.image}' for job image`)
    container = createPodSpec(args.container, JOB_CONTAINER_NAME, true)
  }

  // let services: k8s.V1Container[] = []
  if (args.services?.length) {
    throw new Error('services are not supported')
    // services = args.services.map(service => {
    //   core.debug(`Adding service '${service.image}' to pod definition`)
    //   return createPodSpec(service, service.image.split(':')[0])
    // })
  }
  // if (!container && !services?.length) {
  //   throw new Error('No containers exist, skipping hook invocation')
  // }

  let createdConfigMap: k8s.V1ConfigMap | undefined = undefined
  try {
    const data = { 'drone.sh': await getFileContents('/scripts/drone.sh') }
    createdConfigMap = await createConfigMap(JOB_CONTAINER_NAME, data)
  } catch (err) {
    await pruneConfigMaps()
    throw new Error(`failed to create ConfigMap: ${err}`)
  }

  let createdPod: k8s.V1Pod | undefined = undefined
  try {
    createdPod = await createPod(
      container,
      createdConfigMap,
      args.container.registry
    )
  } catch (err) {
    await prunePods()
    await pruneConfigMaps()
    throw new Error(`failed to create job pod: ${err}`)
  }

  if (!createdPod?.metadata?.name) {
    throw new Error('created pod should have metadata.name')
  }
  core.debug(
    `Job pod created, waiting for it to come online ${createdPod?.metadata?.name}`
  )

  try {
    await waitForPodPhases(
      createdPod.metadata.name,
      new Set([PodPhase.RUNNING]),
      new Set([PodPhase.PENDING])
    )
  } catch (err) {
    await prunePods()
    await pruneConfigMaps()
    throw new Error(`Pod failed to come online with error: ${err}`)
  }

  core.debug('Job pod is ready for traffic')

  let isAlpine = false
  try {
    isAlpine = await isPodContainerAlpine(
      createdPod.metadata.name,
      JOB_CONTAINER_NAME
    )
  } catch (err) {
    throw new Error(`Failed to determine if the pod is alpine: ${err}`)
  }
  core.debug(`Setting isAlpine to ${isAlpine}`)
  generateResponseFile(responseFile, createdPod, isAlpine)
}

function generateResponseFile(
  responseFile: string,
  appPod: k8s.V1Pod,
  isAlpine
): void {
  if (!appPod.metadata?.name) {
    throw new Error('app pod must have metadata.name specified')
  }
  const response = {
    state: {
      jobPod: appPod.metadata.name
    },
    context: {},
    isAlpine
  }

  const mainContainer = appPod.spec?.containers?.find(
    c => c.name === JOB_CONTAINER_NAME
  )
  if (mainContainer) {
    const mainContainerContextPorts: ContextPorts = {}
    if (mainContainer?.ports) {
      for (const port of mainContainer.ports) {
        mainContainerContextPorts[port.containerPort] =
          mainContainerContextPorts.hostPort
      }
    }

    response.context['container'] = {
      image: mainContainer.image,
      ports: mainContainerContextPorts
    }
  }

  const serviceContainers = appPod.spec?.containers.filter(
    c => c.name !== JOB_CONTAINER_NAME
  )
  if (serviceContainers?.length) {
    response.context['services'] = serviceContainers.map(c => {
      if (!c.ports) {
        return
      }

      const ctxPorts: ContextPorts = {}
      for (const port of c.ports) {
        ctxPorts[port.containerPort] = port.hostPort
      }

      return {
        image: c.image,
        ports: ctxPorts
      }
    })
  }
  writeToResponseFile(responseFile, JSON.stringify(response))
}

async function copyExternalsToRoot(): Promise<void> {
  const workspace = process.env['RUNNER_WORKSPACE']
  if (workspace) {
    await io.cp(
      path.join(workspace, '../../externals'),
      path.join(workspace, '../externals'),
      { force: true, recursive: true, copySourceDirectory: false }
    )
  }
}

function createPodSpec(
  container,
  name: string,
  jobContainer = false
): k8s.V1Container {
  if (!container.entryPoint && jobContainer) {
    container.entryPoint = DEFAULT_CONTAINER_ENTRY_POINT
    container.entryPointArgs = DEFAULT_CONTAINER_ENTRY_POINT_ARGS
  }

  const podContainer = {
    name,
    image: container.image,
    command: [container.entryPoint],
    args: container.entryPointArgs,
    ports: containerPorts(container)
  } as k8s.V1Container
  if (container.workingDirectory) {
    podContainer.workingDir = container.workingDirectory
  }

  podContainer.env = []
  for (const [key, value] of Object.entries(
    container['environmentVariables']
  )) {
    if (value && key !== 'HOME') {
      podContainer.env.push({ name: key, value: value as string })
    }
  }

  // podContainer.volumeMounts = containerVolumes(
  //   container.userMountVolumes,
  //   jobContainer
  // )

  return podContainer
}
