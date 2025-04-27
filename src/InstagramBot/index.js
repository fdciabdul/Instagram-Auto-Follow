const UndetectableBrowser = require("undetected-browser");
const puppeteer = require("puppeteer");
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const colorToHtml = require("../utils/colorToHtml");
const { executablePath } = require("puppeteer");
const { app } = require("electron");

class InstagramBot {
    constructor(username, password, mediaShortCode, proxy = null, logCallback = null, dbFile = 'usernames.db') {
        this.browser = null;
        this.page = null;
        this.username = username;
        this.password = password;
        this.mediaShortCode = mediaShortCode;
        this.proxy = proxy;
        this.internalProxy = 'http://127.0.0.1:8080'; // Internal Proxy Fallback
        this.logCallback = logCallback || console.log; 
        this.dbFile = path.isAbsolute(dbFile) ? dbFile : path.join(app.getPath('appData'), dbFile);

    }

    log(message) {
        this.logCallback(`${colorToHtml('green', '[BOT]')}: ${message}`);
    }
    async initializeDatabase() {
        const SQL = await initSqlJs();
        if (!fs.existsSync(this.dbFile)) {
            this.log('🆕 Creating new database...');
            this.db = new SQL.Database();
            this.db.run(`
                CREATE TABLE usernames (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT,
                    assigned_to TEXT DEFAULT NULL,
                    followed BOOLEAN DEFAULT 0
                );
            `);
            this.saveDatabase();
        } else {
            this.log('📂 Loading existing database...');
            const fileBuffer = fs.readFileSync(this.dbFile);
            this.db = new SQL.Database(fileBuffer);
        }
    }

    saveDatabase() {
        const data = this.db.export();
        fs.writeFileSync(this.dbFile, Buffer.from(data));
    }

    async saveUsernamesToDB(usernames) {
        console.log(usernames);
        this.log('Saving usernames to database...');
    
        const checkStmt = this.db.prepare('SELECT COUNT(*) AS count FROM usernames WHERE username = ?;');
        const insertStmt = this.db.prepare('INSERT INTO usernames (username) VALUES (?);');
    
        this.db.run('BEGIN TRANSACTION');
        usernames.forEach(user => {
            try {
                // Check if username exists
                checkStmt.bind([user.username]);
                checkStmt.step();
                const result = checkStmt.getAsObject();
                checkStmt.reset(); // Reset for the next iteration
    
                if (result.count === 0) {
                    // Username does not exist, insert it
                    insertStmt.run([user.username]);
                    this.log(`✅ Inserted username: ${user.username}`);
                } else {
                    this.log(`⚠️ Duplicate username found, skipped: ${user.username}`);
                }
            } catch (error) {
                console.error(`❌ Error processing username ${user.username}: ${error.message}`);
            }
        });
        this.db.run('COMMIT');
    
        checkStmt.free();
        insertStmt.free();
        this.saveDatabase();
    }
    
    async changeStatusUsernames(usernames) {
        try {
            const stmt = this.db.prepare(`
                UPDATE usernames
                SET followed = CASE WHEN followed = 1 THEN 0 ELSE 1 END
                WHERE username ('${usernames}');
            `);
            stmt.bind(usernames);
            stmt.run();
        } catch (error) {
            
        }
    }
    async checkPage() {
        if (!this.page || this.page.isClosed()) {
            this.log('⚠️ Page is not available or was closed. Reinitializing browser...');
            await this.initialize();
        }
    }

    async safeGoto(url, maxRetries = 3) {
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                await this.checkPage(); 
    
                if (!this.page) {
                    throw new Error('Page is null after reinitialization!');
                }
    
                await this.page.goto(url, { waitUntil: 'networkidle2' });
                this.log(`✅ Successfully navigated to ${url}`);
                return;
            } catch (error) {
                attempt++;
                this.log(`❌ Failed to navigate to ${url} (Attempt ${attempt}/${maxRetries}): ${error.message}`);
    
                if (attempt >= maxRetries) {
                    throw new Error(`❌ Failed to navigate to ${url} after ${maxRetries} attempts.`);
                }
    
                await this.delay(2000); 
                await this.checkPage(); 
            }
        }
    }
    
    async getBatchUsernames(batchSize) {
        this.log(`📦 Fetching ${batchSize} usernames for ${this.username}...`);
    
        if (isNaN(batchSize) || batchSize <= 0) {
            throw new Error(`Invalid batch size: ${batchSize}`);
        }
    
        const stmt = this.db.prepare(`
            SELECT id, username FROM usernames 
            WHERE assigned_to IS NULL 
            LIMIT ?;
        `);
    
        stmt.bind([batchSize]);
    
        let usernames = [];
        while (stmt.step()) {
            let row = stmt.getAsObject();
            usernames.push(row.username);
            this.db.run('UPDATE usernames SET assigned_to = ? WHERE id = ?', [this.username, row.id]);
        }
    
        stmt.free();
        this.saveDatabase();
    
        this.log(`✅ Assigned ${usernames.length} usernames to ${this.username}`);
        return usernames;
    }
    
  
    async initialize() {
        const baseLaunchOptions = {
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials',
            ],
            userDataDir: `./session/${this.username}`,
            executablePath : "./driver/chrome.exe",
            userDataDir: path.join(app.getPath('userData'), 'session', this.username),

        };
    
        let launchOptions = { ...baseLaunchOptions };
    
        try {
            if (this.browser) {
                await this.browser.close();
            }
            const UndetectableBMS = new UndetectableBrowser(await puppeteer.launch(launchOptions));
            this.browser = await UndetectableBMS.getBrowser();
            this.page = await this.browser.newPage();
    
            await this.page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36'
            });
    
            this.log('✅ Browser and page initialized successfully.');
        } catch (error) {
            console.error('❌ Failed to initialize browser:', error.message || error);
            throw new Error('Failed to initialize Puppeteer browser');
        }
    }
    
    async closeBrowser() {
        if (this.browser) {
            this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }


    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    parseIgShortcode(shortcode) {
        const regex = /https?:\/\/(?:www\.)?instagram\.com\/p\/(\w+)/i;
        const match = shortcode.match(regex);
        return match ? match[1] : null;
    }

    async randomDelay(min, max) {
        
        const delayTime = Math.floor(Math.random() * (max - min + 1)) + min;
        this.log("Delaying for [" + delayTime +"] milliseconds...");
        await this.delay(delayTime);
    }

    async scrollToBottom() {
        let previousHeight = await this.page.evaluate('document.body.scrollHeight');
        while (true) {
            await this.page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await this.delay(2000);

            let newHeight = await this.page.evaluate('document.body.scrollHeight');
            if (newHeight === previousHeight) {
                break;
            }
            previousHeight = newHeight;
        }
    }

    async getUsernames() {
        const users = [];
        await this.randomDelay(2000, 7000);
        const followButtons = await this.page.$$('button');
    
        for (const button of followButtons) {
            try {
                // Get the button text
                const username = await this.page.evaluate((btn) => {
                    let currentElement = btn;
                    let username = 'unknown';
    
                    for (let i = 0; i < 5; i++) {
                        currentElement = currentElement.parentElement;
                        if (!currentElement) break;
    
                        const userLink = currentElement.querySelector('a[href*="/"]');
                        if (userLink) {
                            const span = userLink.querySelector('span');
                            if (span) {
                                username = span.textContent.trim();
                            } else {
                                username = userLink.getAttribute('href').replace(/\//g, '');
                            }
                            break;
                        }
                    }
                    return username;
                }, button);

                const buttonText = await this.page.evaluate(el => el.textContent.trim(), button);
    
                // Skip if the button is not 'Follow' or is already 'Following'
                if (buttonText.includes('Following') || buttonText.includes('Requested')) {
                    this.log(username + 'Already following, skipping...');
                    continue;
                }
    
                if (!buttonText.includes('Follow')) continue;
   
    
             
           
                users.push({ username });
               
            } catch (error) {
                console.error('Failed to follow:', error.message || error);
                users.push({ username: 'unknown', statusFollow: false });
            }
        }
      //  console.log(users);
      await this.saveUsernamesToDB(users);
        return users;
    }
    
    async followUsernames(usernametarget) {
        this.log(`📲 Following ${usernametarget.length} usernames...`);
    
        for (const username of usernametarget) {
            try {
                await this.safeGoto(`https://www.instagram.com/${username}/`);
                try {
                    await this.randomDelay(2000, 5000);
                    await this.page.waitForSelector('button', { timeout: 5000 });
            
                    const clicked = await this.page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const followButton = buttons.find(btn => btn.textContent.trim() === 'Follow');
                        if (followButton) {
                            followButton.click();
                            return true;
                        }
                        return false;
                    });
            
                    if (clicked) {
                        this.log('✅ Successfully clicked the Follow button using JavaScript evaluation.');
                        await this.changeStatusUsernames(username);
                    } else {
                        this.log('⚠️ Follow button not found.');
                    }
            
                    await this.randomDelay(2000, 5000); 
                } catch (error) {
                    console.error('❌ Failed to click Follow button:', error.message || error);
                }
            } catch (error) {
                console.error('❌ Failed to follow:', error.message || error);
            }
        }
    }
    
    
    
    async checkLoginStatus() {
        try {
            const profileXpath = '::-p-xpath(/html/body/div[1]/div/div/div/div[2]/div/div/div[1]/div[1]/div[2]/div/div/div/div/div[2]/div[9])';
            await this.page.waitForSelector(profileXpath, { timeout: 15000 });
            this.log("Already logged in");
               
            await this.page.goto(
                "https://www.instagram.com/p/" + urlMedia + "/liked_by/",
                { waitUntil: "networkidle2" }
            );

            await this.scrollToBottom();
            return true;
        } catch (error) {
            this.log("challenge | "+this.username)
            try {
                const profileXpaths = '::-p-xpath(/html/body/div[1]/div/div/div/div[2]/div/div/div[1]/div[1]/div[2]/div/div/div/div/div[2]/div[9])';
                await this.page.waitForSelector(profileXpaths, { timeout: 155000 });
                return true;
            } catch (error) {
                return false;
                
            }
         
        }
    }

    async goToMediaPage(mediaShortCode) {
        try {
            await this.checkPage();
    
            const urlMedia = this.parseIgShortcode(mediaShortCode);
            if (!urlMedia) {
                throw new Error('Invalid media shortcode.');
            }
    
            await this.safeGoto(`https://www.instagram.com/p/${urlMedia}/liked_by/`);
            await this.scrollToBottom();
    
            return true;
        } catch (error) {
            console.error('❌ Failed to navigate to media page:', error.message || error);
            await this.checkPage(); 
            return false;
        }
    }
    
    
    async login() {
        await this.page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
       try {
          this.log("Checking login status...");
         
           const profileXpath = '::-p-xpath(/html/body/div[1]/div/div/div/div[2]/div/div/div[1]/div[1]/div[2]/div/div/div/div/div[2]/div[8])';
           await this.page.waitForSelector(profileXpath, { timeout: 15000 });

           this.log("Already logged in");
         
          
        }catch (error) {
            this.log("Logging in...");
  

            await this.page.type('input[name="username"]', this.username, { delay: 100 });
            await this.page.type('input[name="password"]', this.password, { delay: 100 });

            const loginButton = await this.page.$('button[type="submit"]');
            if (loginButton) {
                await loginButton.click();
            }
            await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
            await this.checkLoginStatus();
            return true;
        }
    }

    async start() {
        try {
            await this.initialize();

            await this.page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
            try {
                const profileXpath = '::-p-xpath(/html/body/div[1]/div/div/div/div[2]/div/div/div[1]/div[1]/div[2]/div/div/dikpdjsav/div/div[2]/div[8]/div/span)';
                await this.page.waitForSelector(profileXpath, { timeout: 5000 });

                this.log("Already logged in");
                return true;
            } catch (error) {
                return false;
            }

        } catch (error) {
            console.error('Error:', error.message || error);
            if (this.browser) await this.browser.close();
        }
    }
}

module.exports = InstagramBot;