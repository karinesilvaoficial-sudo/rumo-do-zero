import {Config} from '@remotion/cli/config';
import fs from 'node:fs';

const shell = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
if (fs.existsSync(shell)) Config.setBrowserExecutable(shell);
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setPixelFormat('yuv420p');
Config.setConcurrency(4);
Config.setChromiumOpenGlRenderer('swangle');
