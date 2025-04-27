const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { mkdirp } = require('mkdirp')
const unzipper = require('unzipper');
const streamPipeline = promisify(pipeline);

 class Downloader {
    constructor(path) {
        this.path = path; 
        this.url = "https://github.com/imtaqin/YOMEN/releases/download/v1/bin.zip";
    }

    async downloadFromUrl() {
        try {
            console.log(`Downloading from: ${this.url} ⎛⎝ ≽ > ⩊ < ≼ ⎠⎞`);
            const { headers } = await axios.head(this.url);
       
          
            const response = await axios({
                method: 'get',
                url: this.url,
                responseType: 'stream'
            });

            let downloadedSize = 0;
            response.data.on('data', (chunk) => {
                downloadedSize += chunk.length;
            });

            await streamPipeline(response.data, fs.createWriteStream(this.path));

            console.log(`Download complete: ${this.path}`);

            await this.unzipFile();

        } catch (error) {
            console.error(`Download failed: ${error.message}`);
        }
    }

    async checkChromeExists() {
        try {
            const data =  fs.existsSync("./driver/chrome.exe");
            if (data) {
                return true;
            }else{
                return false;
            }
        } catch (error) {
            return false;
        }
    }
    async unzipFile() {
        const outputDir = path.join(path.dirname(this.path), 'driver');

        try {
            console.log(`Unzipping to: ${outputDir}`);

            // Use mkdirp to ensure the directory exists
            await mkdirp(outputDir);

            // Unzip using unzipper
            await fs.createReadStream(this.path)
                .pipe(unzipper.Extract({ path: outputDir }))
                .promise();

            console.log('Unzipping complete!');
        } catch (error) {
            console.error(`Unzipping failed: ${error.message}`);
        }
    }
}


module.exports = Downloader;