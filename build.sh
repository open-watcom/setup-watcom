#!/usr/bin/env sh

set -e

cd $(dirname $0)

npm ci
npm run build
npm run pack

echo "Build succesful!"
