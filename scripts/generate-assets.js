// scripts/generate-assets.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 480,
    height: 320,
    show: false,
    frame: false,
    useContentSize: true, // Use exactly 600x400 for the content
    enableLargerThanScreen: true,
  });

  const svgPath = path.join(__dirname, '../build/background.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  
  const html = `
    <!DOCTYPE html>
    <html><body style="margin:0;padding:0;overflow:hidden;background:transparent;">
      ${svgContent}
    </body></html>
  `;
  
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Wait for rendering
  await new Promise((r) => setTimeout(r, 800));

  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '../build/background.png'), image.toPNG());

  app.quit();
});
