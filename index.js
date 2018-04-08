'use strict';

const path     = require('path');
const BbPromise    = require('bluebird');
const async        = require('async');
const _            = require('lodash');
const mime         = require('mime');
const fs           = require('fs');

const regionToUrlRootMap = region => ({
  'us-east-2': 's3-website.us-east-2.amazonaws.com',
  'us-east-1': 's3-website-us-east-1.amazonaws.com',
  'us-west-1': 's3-website-us-west-1.amazonaws.com',
  'us-west-2': 's3-website-us-west-2.amazonaws.com',
  'ca-central-1': 's3-website.ca-central-1.amazonaws.com',
  'ap-south-1': 's3-website.ap-south-1.amazonaws.com',
  'ap-northeast-2': 's3-website.ap-northeast-2.amazonaws.com',
  'ap-southeast-1': 's3-website-ap-southeast-1.amazonaws.com',
  'ap-southeast-2': 's3-website-ap-southeast-2.amazonaws.com',
  'ap-northeast-1': 's3-website-ap-northeast-1.amazonaws.com',
  'eu-central-1': 's3-website.eu-central-1.amazonaws.com',
  'eu-west-1': 's3-website-eu-west-1.amazonaws.com',
  'eu-west-2': 's3-website.eu-west-2.amazonaws.com',
  'eu-west-3': 's3-website.eu-west-3.amazonaws.com',
  'sa-east-1': 's3-website-sa-east-1.amazonaws.com',
}[region])

class UploadSiteToS3 {
  constructor(serverless, options){
    this.serverless = serverless;
    this.provider = 'aws';
    this.aws = this.serverless.getProvider(this.provider);
    this.hooks = {
      'after:deploy:deploy': () => {
        this.stage = _.get(serverless, 'service.provider.stage')
        this.region = _.get(serverless, 'service.provider.region');
        this._validate()
          .then(this._clearAndUploadFilesToS3.bind(this));
      }
    };
  }

  listObjectsInBucket() {
    let params = {
      Bucket: this.bucketName
    };
    return this.aws.request('S3', 'listObjectsV2', params, this.stage, this.region);
  }

  deleteObjectsFromBucket(data) {
    if (!data.Contents[0]) {
      return BbPromise.resolve();
    } else {
      let Objects = _.map(data.Contents, function (content) {
        return _.pick(content, 'Key');
      });

      let params = {
        Bucket: this.bucketName,
        Delete: { Objects: Objects }
      };

      return this.aws.request('S3', 'deleteObjects', params, this.stage, this.region);
    }
  }

  _validate() {
    const Utils = this.serverless.utils;
    const Error = this.serverless.classes.Error;

    if (!this.serverless.service.custom ||
        !this.serverless.service.custom.client ||
        !this.serverless.service.custom.client.bucketName) {
      return BbPromise.reject(new Error('Please specify a bucket name for the client in serverless.yml.'));
    }

    if (!this.serverless.service.custom ||
      !this.serverless.service.custom.client ||
      !this.serverless.service.custom.client.distributionFolder) {
      return BbPromise.reject(new Error('Please specify a distribution folder for the client in serverless.yml.'));
    }

    const distributionFolder = this.serverless.service.custom.client.distributionFolder;
    const clientPath = path.join(this.serverless.config.servicePath, distributionFolder);
    
    if (!Utils.dirExistsSync(clientPath)) {
      return BbPromise.reject(new Error('Could not find ' + clientPath + ' folder in your project root.'));
    }

    this.bucketName = this.serverless.service.custom.client.bucketName;
    this.clientPath = clientPath;

    return BbPromise.resolve();
  }

  _clearAndUploadFilesToS3() {
    this.serverless.cli.log('Deploying files to stage "' + this.stage + '" in region "' + this.region + '"...');
    return this.listObjectsInBucket()
      .then((data) => {
        return this.deleteObjectsFromBucket(data);
      })
      .then(() => {
        return this._uploadDirectory(this.clientPath);
      })
      .catch(error => {
        this.serverless.cli.log(`Failed to upload files to s3. Error: ${error.message}`);
      });
  }

  _uploadDirectory(directoryPath) {
    let _this         = this,
    readDirectory = _.partial(fs.readdir, directoryPath);

    async.waterfall([readDirectory, function (files) {
      files = _.map(files, function(file) {
        return path.join(directoryPath, file);
      });

      async.each(files, function(path) {
        fs.stat(path, _.bind(function (err, stats) {

          return stats.isDirectory()
            ? _this._uploadDirectory(path)
            : _this._uploadFile(path);
        }, _this));
      });
    }]);
  }

  _uploadFile(filePath) {
    let _this      = this,
        fileKey    = filePath.replace(_this.clientPath, '').substr(1).replace(/\\/g, '/'),
        urlRoot    = regionToUrlRootMap(_this.region);

    fs.readFile(filePath, function(err, fileBuffer) {
      let params = {
        Bucket: _this.bucketName,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: mime.getType(filePath)
      };
      return _this.aws.request('S3', 'putObject', params, _this.stage, _this.region);
    });
  }
}

module.exports = UploadSiteToS3;
