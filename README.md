# serverless-upload-site-to-s3
[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

A [serverless](http://www.serverless.com) plugin to _automatically_ upload a local directory to s3 bucket.

## Install

`npm install --save-dev serverless-upload-site-to-s3`

Add the plugin to your `serverless.yml` file:

```yaml
plugins:
  - serverless-upload-site-to-s3
```

## Configuration

```yaml
custom:
  client:
    bucketName: s3-bucketname
    distributionFolder: relative path to folder to be uploaded
```

This plugin is inspired from [serverless-finch](https://github.com/fernando-mc/serverless-finch)