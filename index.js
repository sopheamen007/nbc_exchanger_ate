const express = require("express")
const puppeteer = require('puppeteer')
const dotenv = require('dotenv').config()
const app = express()
// json to xml
const js2xmlparser = require("js2xmlparser");

const PORT = process.env.PORT
const NBC_WEBSITE = process.env.NBC_WEBSITE
const NSSF_WEBSITE = process.env.NSSF_WEBSITE
const GDT_WEBSITE = process.env.GDT_WEBSITE

app.get('/', (req, res) => {
    const date = req.query.date ?? '';
    scrapeNBC(date).then(function(data) {
        res.setHeader('Content-Type', 'text/plain');
        
        // convert date
        const date = new Date(data['exchange_date']);
        const formattedDate = date.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

        let newData = {
            'item' : {
                'title' : `1 USD = ${data['exchange_rate']} KHR`,
                'pubDate' : formattedDate,
                'targetCurrency' : 'KHR',
                'exchangeRate' : data['exchange_rate']
            }
        }
        const xmlData = js2xmlparser.parse("root", newData);
        // console.log(data['exchange_rate']);
        // res.send(data);
        res.send(xmlData);
    })
    .catch(function (e) {
        res.status(500, {
            error: e
        });
        // send email notification
    });
});

app.get('/nssf-exr-rate', (req, res) => {
    scrapeNSSF().then(function(data) {
        res.send(data);
    })
    .catch(function (e) {
        res.status(500, {
            error: e
        });
    });
});

app.get('/exr-rate', (req, res) => {
    scrapeExchangeRate().then(function(data) {
        res.send(data);
    })
    .catch(function (e) {
        res.status(500, {
            error: e
        });
    });
});

app.listen(PORT, function () {
    console.log(`app listening on port ${PORT}!`);
});


async function scrapeNBC(date) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Disable JavaScript for faster loading
    await page.setJavaScriptEnabled(false);

    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
            request.abort();
        } else {
            request.continue();
        }
    });

    // Navigate to the NBC website with increased timeout
    await page.goto(NBC_WEBSITE, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Re-enable JavaScript if necessary for interactions
    await page.setJavaScriptEnabled(true);

    // Interact with the page
    await page.focus('#datepicker');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(date);
    await page.click('input[type="submit"]');

    // Wait for the result to load
    await page.waitForSelector("#fm-ex > table > tbody > tr:nth-child(1) > td > font");

    // Extract the data
    const data = await page.evaluate(() => {
        const date = document.querySelector("#fm-ex > table > tbody > tr:nth-child(1) > td > font").innerText;
        const rate = document.querySelector("#fm-ex > table > tbody > tr:nth-child(2) > td > font").innerText;
        return { exchange_date: date, exchange_rate: rate };
    });

    await browser.close();
    return data;
}




async function scrapeNSSF() {
    try {
        // Launch the browser and open a new blank page
        const browser = await puppeteer.launch({headless: 'new'});
        const page = await browser.newPage();
        // Navigate the page to a URL
        await page.goto(NSSF_WEBSITE, { waitUntil: 'domcontentloaded' });

        let data = await page.evaluate(() => {
            let text = document.querySelector("div.nssf-blockcontent > div > ul > li:nth-child(1) > a:nth-child(3)").innerText;
            let splitText = text.split(" ");
            let exchangeRate = splitText[splitText.length - 2];
            let month = new Date(Date.parse(splitText[2] +" 1, 2000")).getMonth()+1;
            let exchangeMonth = splitText[3] + "-" + month;
            return {
                exchange_month: exchangeMonth,
                exchange_rate: exchangeRate,
                data: text
            };
        });
        await browser.close();
        return data;
    }
    catch (e) {
        console.log(e);
        browser.close();
    }
}





async function scrapeExchangeRate() {
    try {
        // Launch the browser and open a new blank page
        const browser = await puppeteer.launch({headless: 'new'});
        const page = await browser.newPage();
        // Navigate the page to a URL
        await page.goto(GDT_WEBSITE, { waitUntil: 'networkidle0' });

        let data = await page.evaluate(() => {
            let rows = Array.from(document.querySelectorAll("#data-container tr"));
            let lists = Array.from(rows, row => {
                let cols = row.querySelectorAll('td');
                return {
                    exchange_date: cols[0].innerText.split("\n")[0],
                    exchange_symbol: cols[1].innerText,
                    exchange_rate: cols[2].innerText
                };
            });
            return {
                current_exchange_rate: {
                    exchange_date: document.querySelector('.current-date').innerText,
                    exchange_rate: document.querySelector('.moul').innerText.split(" ")[0],
                },
                exchange_lists: lists
            };
        });
        await browser.close();
        return data;
    }
    catch (e) {
        console.log(e);
        browser.close();
    }
}

