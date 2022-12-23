 http_response=$(curl \
      -s -o /dev/null -w "%{http_code}" \
      --fail --connect-timeout 5 \
      -X POST -H "Authorization: Bearer ${DRONE_TOKEN}" \
      https://drone-gh.acp.homeoffice.gov.uk/api/repos/${GITHUB_REPOSITORY}/builds?branch=${GITHUB_REF_NAME}&commit=${GITHUB_SHA})
    
      if [ ! $http_response  -eq 200 ]; then
        printf "\nFailed to trigger Drone. Response code: $http_response\n\n" 1>&2
        exit 1 
      fi
      exit 0