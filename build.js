const fs=require('fs');
const zlib=require('zlib');

const buildBundle=fs.readFileSync('build.bundle.txt','utf8').trim();
const buildSource=zlib.gunzipSync(Buffer.from(buildBundle,'base64')).toString('utf8');
new Function('require','__dirname','__filename','process','Buffer',buildSource)(require,__dirname,__filename,process,Buffer);

const homepageBundle=[1,2,3].map(i=>fs.readFileSync(`homepage.v9.part${i}.txt`,'utf8').trim()).join('');
const homepageSource=zlib.gunzipSync(Buffer.from(homepageBundle,'base64')).toString('utf8');
new Function('require','__dirname','__filename','process','Buffer',homepageSource)(require,__dirname,__filename,process,Buffer);

const onboardingBundle=[1,2,3].map(i=>fs.readFileSync(`onboarding.v12.part${i}.txt`,'utf8').trim()).join('');
const onboardingSource=zlib.gunzipSync(Buffer.from(onboardingBundle,'base64')).toString('utf8');
new Function('require','__dirname','__filename','process','Buffer',onboardingSource)(require,__dirname,__filename,process,Buffer);

require('./speech-analytics-v11.js');
require('./trust-v12-2.js');
