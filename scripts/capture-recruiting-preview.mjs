import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const output = resolve(process.argv[2] ?? "../recruiting-screenshots");
await mkdir(output,{recursive:true});
const browser = await chromium.launch({headless:true});
try {
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  await context.addCookies([{name:"xportal_cookie_consent",value:"v3.essential",domain:"127.0.0.1",path:"/"}]);
  const page = await context.newPage();
  for (const [name,path] of [["landing","/freelancer-finden"],["preise","/preise"],["trial-beispiel","/chat/preview/billing"],["ergebnis-beispiel","/chat/preview?state=ranked&plan=pro"]]) {
    await page.goto(`http://127.0.0.1:3107${path}`,{waitUntil:"networkidle"});
    await page.screenshot({path:resolve(output,`${name}.png`),fullPage:true});
    console.log(JSON.stringify({name,url:page.url(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)}));
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto("http://127.0.0.1:3107/freelancer-finden",{waitUntil:"networkidle"});
  await page.screenshot({path:resolve(output,"landing-mobil.png"),fullPage:true});
  console.log(JSON.stringify({name:"landing-mobil",overflow:await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)}));
} finally {await browser.close();}
