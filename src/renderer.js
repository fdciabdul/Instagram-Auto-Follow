// 📌 Initialization Logic
document.addEventListener('DOMContentLoaded', async () => {
    // 📌 UI Elements
    const form = document.getElementById('bot-form');
    const csvUpload = document.getElementById('csv-upload');
    const startCsvBot = document.getElementById('start-csv-bot');
    const logContainer = document.getElementById('log-container');
    const popupAlert = document.getElementById('popup-alert');
    const popupClose = document.getElementById('popup-close');
    const proxyAddress = document.getElementById('proxy-address');
    const proxyUsername = document.getElementById('proxy-username');
    const proxyPassword = document.getElementById('proxy-password');
    const proxyPort = document.getElementById('proxy-port');
    const proxySaveButton = document.getElementById('proxy-save');

    // 🛠️ Utility Functions
    function addLog(log) {
        logContainer.innerHTML += log + "<br>";
        logContainer.scrollTop = logContainer.scrollHeight;

        // 📌 Trigger popup if [BOT]: popup is detected
        if (log.includes('challenge')) {
            let name = log.split('|')[1]?.trim(); // Extract username after '|'
            if (name) {
                showPopup(name); // Pass username to showPopup
            }
        }
    }

    function showPopup(username) {
        const popupUsername = document.getElementById('popup-username');
        popupUsername.textContent = username; // Set the username dynamically
        popupAlert.classList.remove('hidden');
    }

    function hidePopup() {
        popupAlert.classList.add('hidden');
    }

    // 📌 Popup Close Button
    popupClose.addEventListener('click', hidePopup);

    // -----------------------------------------------------
    // 🚀 BOT FUNCTIONALITY
    // -----------------------------------------------------

    // 📌 Start Bot with Manual Input
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const mediaShortCode = document.getElementById('media-url').value;

        addLog(`🚀 Memulai bot untuk ${username}...`);

        const result = await window.botAPI.startBot(username, password, mediaShortCode);

        if (result.status === 'success') {
            addLog(`✅ Bot berhasil diselesaikan untuk ${username}.`);
        } else {
            addLog(`❌ Kesalahan: ${result.message}`);
        }
    });

    // 📌 Start Bot with CSV Upload
   // 📌 Start Bot with CSV Upload
   startCsvBot.addEventListener('click', async () => {
    if (!csvUpload.files.length) {
        addLog("⚠️ Harap unggah file CSV.");
        return;
    }

    const file = csvUpload.files[0];
    const reader = new FileReader();

    reader.onload = async (event) => {
        const csvData = event.target.result;
        const rows = csvData.split('\n').slice(1).filter(row => row.trim()); // Skip header and empty rows

        const accounts = [];
        for (const row of rows) {
            const [username, password, mediaShortCode] = row.split(',');

            if (!username || !password || !mediaShortCode) {
                addLog("⚠️ Baris tidak valid, dilewati...");
                continue;
            }

            accounts.push({ username, password, mediaShortCode: mediaShortCode.trim() });
        }

        const accountCount = accounts.length;

        if (accountCount === 0) {
            addLog("⚠️ Tidak ada akun yang valid di file CSV.");
            return;
        }

        addLog(`📊 Total akun valid di CSV: ${accountCount}`);

        // 🥇 First Account
        const firstAccount = accounts[0]; // Remove the first account from the array
        addLog(`🚀 Memulai bot pertama untuk ${firstAccount.username} (Scraping usernames)...`);
        const firstResult = await window.botAPI.startBot(firstAccount.username, firstAccount.password, firstAccount.mediaShortCode, accountCount, true);

        if (firstResult.status === 'success') {
            addLog(`✅ Bot pertama (${firstAccount.username}) berhasil menyimpan username ke database.`);
        } else {
            addLog(`❌ Kesalahan pada bot pertama (${firstAccount.username}): ${firstResult.message}`);
            return;
        }

        // 🚀 Other Accounts
        for (const account of accounts) {
            addLog(`🚀 Memulai bot untuk ${account.username}...`);
            const result = await window.botAPI.startBot(account.username, account.password, account.mediaShortCode, accountCount, false);

            if (result.status === 'success') {
                addLog(`✅ Berhasil diselesaikan untuk ${account.username}.`);
            } else {
                addLog(`❌ Kesalahan dengan ${account.username}: ${result.message}`);
            }
        }

        addLog("🎉 Selesai memproses file CSV.");
    };

    reader.readAsText(file);
});



    // -----------------------------------------------------
    // 🔑 PROXY FUNCTIONALITY
    // -----------------------------------------------------

    // 📌 Load Proxy Settings on Startup
    async function loadProxySettings() {
        const proxyConfig = await window.botAPI.getProxy();
        proxyAddress.value = proxyConfig.address || '';
        proxyUsername.value = proxyConfig.username || '';
        proxyPassword.value = proxyConfig.password || '';
        proxyPort.value = proxyConfig.port || '';
        addLog('✅ Pengaturan proxy dimuat.');
    }

    await loadProxySettings();

    // 📌 Save Proxy Settings
    proxySaveButton.addEventListener('click', async () => {
        const address = proxyAddress.value;
        const username = proxyUsername.value;
        const password = proxyPassword.value;
        const port = proxyPort.value;

        const result = await window.botAPI.setProxy(address, username, password, port);

        if (result.status === 'success') {
            addLog('✅ Pengaturan proxy berhasil disimpan.');
        } else {
            addLog(`❌ Gagal menyimpan pengaturan proxy: ${result.message}`);
        }
    });

    // -----------------------------------------------------
    // 📡 Listen for Logs from Main Process
    // -----------------------------------------------------

    window.botAPI.onBotLog((log) => {
        addLog(log);
    });
});
