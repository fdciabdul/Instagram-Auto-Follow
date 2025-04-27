const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const InstagramBot = require('./src/InstagramBot');
const ProxyChain = require('proxy-chain');
const Downloader = require('./src/utils/net');

let mainWindow;
const proxyConfigPath = path.join(app.getPath('userData'), 'proxy-config.json');

let proxyServer = null;
let proxyUrl = null;
const botInstances = new Map();
/**
 * Create Electron Window
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        frame: false,
        transparent: true,
        resizable: false,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, './src/preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    mainWindow.loadFile('./src/index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}


async function startProxyServerAtStartup() {
    if (!fs.existsSync(proxyConfigPath)) {
        console.log("⚠️ No valid proxy configuration found. Skipping proxy setup.");
        return null;
    }

    try {
        const proxyConfig = JSON.parse(fs.readFileSync(proxyConfigPath, 'utf-8'));
        const { address, username, password,port } = proxyConfig;

        if (!address) {
            console.log("⚠️ Proxy address is missing. Skipping proxy setup.");
            return null;
        }

        const upstreamProxyUrl = `socks5://${username}:${password}@${address}:${port}`;
        console.log(`🔗 Starting ProxyChain with Upstream Proxy: ${upstreamProxyUrl}`);

        proxyServer = new ProxyChain.Server({
            port: 8080, // Local proxy port
            //verbose: true,
            prepareRequestFunction: ({ request }) => {
               /// console.log(`🔌 Proxy Request: ${request.url}`);
                return {
                    upstreamProxyUrl,
                };
            }
        });

        await proxyServer.listen();
        proxyUrl = 'http://127.0.0.1:8080'; // Store globally
        console.log(`✅ Proxy server started at ${proxyUrl}`);
    } catch (error) {
        console.error(`❌ Failed to start ProxyChain: ${error.message}`);
        proxyUrl = null;
    }
}

/**
 * Save Proxy Settings
 */
ipcMain.handle('set-proxy', async (event, { address, username, password,port }) => {
    try {
        const proxyConfig = { address, username, password,port };
        console.log('💾 Saving proxy settings:', proxyConfig);
        fs.writeFileSync(proxyConfigPath, JSON.stringify(proxyConfig, null, 2));

        // Restart ProxyChain server with new configuration
        if (proxyServer) {
            await proxyServer.close();
            console.log('🛑 Restarting Proxy server...');
        }
        await startProxyServerAtStartup();

        return { status: 'success', message: 'Proxy settings saved and proxy restarted successfully.' };
    } catch (error) {
        console.error('❌ Failed to save proxy settings:', error.message);
        return { status: 'error', message: error.message };
    }
});

/**
 * Load Proxy Settings
 */
ipcMain.handle('get-proxy', async () => {
    try {
        if (fs.existsSync(proxyConfigPath)) {
            const data = fs.readFileSync(proxyConfigPath, 'utf-8');
            return JSON.parse(data);
        }
        return { address: '', username: '', password: '',port: '' }; // Default empty values
    } catch (error) {
        console.error('❌ Failed to load proxy settings:', error.message);
        return { address: '', username: '', password: '',port: '' };
    }
});

/**
 * Start Instagram Bot with Proxy Configuration (if available)
 */
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
    
}
ipcMain.handle('start-bot', async (event, { username, password, mediaShortCode, accountCount = 1, isFirstAccount = false }) => {
    try {
        
        console.log(`🚀 Starting Instagram Bot for ${username}`);
        console.log(`📊 Account count: ${accountCount}`);
        console.log(`🛠️ Is First Account: ${isFirstAccount}`);

        if (!accountCount || isNaN(accountCount) || accountCount <= 0) {
            throw new Error(`Invalid account count: ${accountCount}`);
        }

        

        const bot = new InstagramBot(
            username,
            password,
            mediaShortCode,
            proxyUrl ? { address: proxyUrl } : null,
            (log) => mainWindow.webContents.send('bot-log', `[${username}] ${log}`)
        );
      
        await bot.initializeDatabase();

        if (isFirstAccount) {
            await bot.initialize();
            await bot.login();
            await bot.goToMediaPage(mediaShortCode);
            const scrapedUsernames = await bot.getUsernames();
            await bot.saveUsernamesToDB(scrapedUsernames);
            await bot.closeBrowser();
            botInstances.delete(username);
            console.log(`✅ ${scrapedUsernames.length} usernames saved to database.`);
            botInstances.delete(username);
            await delay(4000);
        } else {
            const result = bot.db.exec(`SELECT COUNT(*) AS total FROM usernames WHERE assigned_to IS NULL;`);
            const totalUsernames = result?.[0]?.values?.[0]?.[0] || 0;

            if (totalUsernames === 0) {
                throw new Error('No usernames available in the database. Run the first account first.');
            }

            const batchSize = Math.ceil(totalUsernames / accountCount);
            const userBatch = await bot.getBatchUsernames(batchSize);

            console.log(`✅ ${username} assigned ${userBatch.length} usernames.`);
            await bot.initialize();
            await bot.login();
            await bot.followUsernames(userBatch);
            await bot.closeBrowser();
        }

        botInstances.set(username, bot);

        return { status: 'success', message: `Bot started for ${username}.` };
    } catch (error) {
        console.error(`❌ Error starting bot: ${error.message}`);
        return { status: 'error', message: error.message || error };
    }
});




ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:close', async () => {
    if (proxyServer) {
        await proxyServer.close();
        console.log('🛑 Proxy server stopped during app shutdown.');
    }
    if (mainWindow) mainWindow.close();
});

app.whenReady().then(async () => {
    const zipFilePath = './bin.zip';
    const driverFolderPath = './driver';

    await startProxyServerAtStartup(); 
    if (fs.existsSync(driverFolderPath) && fs.readdirSync(driverFolderPath).length > 0) {
        
       
    } else {
        if (fs.existsSync(zipFilePath)) {
          
            const downloader = new Downloader(zipFilePath);
            await downloader.unzipFile();  
        } else {
            
            const downloader = new Downloader(zipFilePath);
            await downloader.downloadFromUrl();  
        }
    }
    const bot = new InstagramBot();
    await bot.initializeDatabase();
    createWindow();
  
});

app.on('window-all-closed', async () => {
    if (proxyServer) {
        await proxyServer.close();
        console.log('🛑 Proxy server stopped as all windows are closed.');
    }
    if (process.platform !== 'darwin') app.quit();
});
