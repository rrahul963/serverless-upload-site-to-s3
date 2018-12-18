const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const recursive = require("recursive-readdir");

const validate = function validate(serverless) {
  const utils = serverless.utils;
  const Error = serverless.classes.Error;
  if (!serverless.service.custom ||
    !serverless.service.custom.client ||
    !serverless.service.custom.client.bucketName) {
    throw new Error('Please specify a bucket name for the client in serverless.yml.');
  }

  if (!serverless.service.custom ||
    !serverless.service.custom.client ||
    !serverless.service.custom.client.distributionFolder) {
    throw new Error('Please specify a distribution folder for the client in serverless.yml.');
  }

  const distributionFolder = serverless.service.custom.client.distributionFolder;
  const clientPath = path.join(serverless.config.servicePath, distributionFolder);

  if (!utils.dirExistsSync(clientPath)) {
    throw new Error('Could not find ' + clientPath + ' folder in your project root.');
  }

  return {
    clientPath,
    bucketName: serverless.service.custom.client.bucketName
  }
};

const cleanBucket = async function cleanBucket(serverless, bucketName, creds, region) {
  const s3 = new AWS.S3({
    region,
    accessKeyId: creds.credentials.accessKeyId,
    secretAccessKey: creds.credentials.secretAccessKey,
    sessionToken: creds.credentials.sessionToken
  });
  let nextMarker = undefined;
  let isTruncated = true;
  const content = []
  while (isTruncated) {
    let resp = null;
    if (nextMarker) {
      resp = await s3.listObjectsV2({ Bucket: bucketName, Marker: nextMarker }).promise();
    } else {
      resp = await s3.listObjectsV2({ Bucket: bucketName}).promise();
    }
    content.push(...resp.Contents);
    isTruncated = resp.IsTruncated;
    nextMarker = resp.NextMarker;
  };
  await Promise.all(content.map(c => {
    return s3.deleteObject({ Bucket: bucketName, Key: c.Key }).promise();
  }));
};

const uploadFilesToS3 =
  async function uploadFilesToS3(serverless, bucketName, clientPath, creds, region) {
    const filesPath = await recursive(clientPath);
    const s3 = new AWS.S3({
      region,
      accessKeyId: creds.credentials.accessKeyId,
      secretAccessKey: creds.credentials.secretAccessKey,
      sessionToken: creds.credentials.sessionToken
    });
    await Promise.all(filesPath.map(filePath => {
      const fileBody = fs.readFileSync(filePath);
      const distributionFolder = serverless.service.custom.client.distributionFolder;
      const fileKey = filePath.replace(`${serverless.config.servicePath}/${distributionFolder}/`, '');
      return s3.upload({ Body: fileBody, Bucket: bucketName, Key: fileKey }).promise();
    }));
  }

const cleanAndUploadFilesToS3 =
  async function cleanAndUploadFilesToS3(serverless, bucketName, clientPath, creds, region, stage) {
    serverless.cli.log('Deploying files to stage "' + stage + '" in region "' + region + '"...');
    await cleanBucket(serverless, bucketName, creds, region);
    serverless.cli.log('Removed existing items from the bucket');
    await uploadFilesToS3(serverless, bucketName, clientPath, creds, region);
    serverless.cli.log('Upload completed');
  }

const uploadSiteToS3 = async function uploadSiteToS3(serverless) {
  try {
    const creds = serverless.getProvider('aws').getCredentials();
    const region = serverless.service.provider.region;
    const stage = serverless.service.provider.stage;
    const { clientPath, bucketName } = validate(serverless);
    await cleanAndUploadFilesToS3(serverless, bucketName, clientPath, creds, region, stage);
  } catch (error) {
    serverless.cli.log(`Failed:: ${error.message || error}`);
  }

};

class UploadSiteToS3 {
  constructor(serverless, options){
    this.hooks = {
      'after:deploy:deploy': async () => {
        await uploadSiteToS3(serverless);
      }
    };
  }
}

module.exports = UploadSiteToS3
