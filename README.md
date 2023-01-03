## Self-hosted runner

Our deployment environments are locked down and not publicly accessible. This means that we can't use
GitHub actions to perform our deployments. Our current CI/CD platform is Drone which also limits us to a
single pipeline configuration file. 

### The challenge

If we use GitHub actions in any part of our workflow we can't create an uninterrupted workflow that deploys
into an environment. We have considered building in GitHub and using tags to trigger deployments. Whilst
this works for releases, it isn't suitable for branch builds/deploys as it would litter the repository
with tags and/or move tags on a public repo (considered bad practice to many).

GitHub-hosted runners can't connect to our CI/CD platform and trigger build.

### The solution

The solution is to deploy a self-hosted runner that can access our CI/CD platform. However, self-hosted 
runners are only recommended for private repositories [self-hosted-runner-security](https://docs.github.com/en/actions/hosting-your-own-runners/about-self-hosted-runners#self-hosted-runner-security).

To mitigate this we have created this runner to severely restrict the actions that can be performed.
The runner forces jobs to always runs inside a container which subsequently ensures our container 
customizations are applied. 

The following customisations are applied  

* Container image is restriced to a single known image
* No volumes are shared between runner and container
* No source code is downloaded from the repository
* Only a runner managed script is sent to the container to be run.
* The environment variables used in the managed script are controlled by the GitHub action

### Solution overview

<img width="800px" src="./overview.png?raw=true" />

## Deployment

The customisations have been applied to the docker and k8s hooks so the runner can be deployed in either mode.

## Build

### Runner container hooks

### Runner docker image

### TODO
Code owners
Code of conduct
Consider removing running jobs (Don't think it's required)
Reduce required permissions (if removing jobs)
Make drone base url an environment variable
Pipeline
Documentation for building in readme (useful commands and mounting hostpath to test development)
Throw an error if their step is not attempting to run drone
Check drone token env var exists
Build and push Image
Branch protection for main and drone-only(effectively our main)
Allow image name to be configured as admission control sometimes restricts registries and also to account for registry prefixes
