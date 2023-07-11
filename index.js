require("dotenv").config();
const puppeteer = require("puppeteer");
const CronJob = require("cron").CronJob;
const axios = require("axios");
const { DateTime } = require("luxon");

let prevListings = {};

const items = process.env.ITEM.split(", ");

const botToken = process.env.BOT_TOKEN;
const botChatID = process.env.BOT_CHATID;

const job = new CronJob({
  cronTime: process.env.CRON_EXPRESSION,
  onTick: loadPages,
});

async function loadPages() {
  console.log("Job started.");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--incognito"],
  });

  try {
    const context = await browser.createIncognitoBrowserContext();

    for (const item of items) {
      console.log(`Loading item: ${item}`);

      const link = `https://sg.carousell.com/search/${encodeURIComponent(
        item
      )}?sort_by=time_created%2Cdescending`;

      const page = await context.newPage();
      await setPageSettings(page);

      await page.goto(link, {
        waitUntil: "load",
        timeout: 0,
      });

      const data = await page.evaluate(() => {
        return window.initialState;
      });

      await page.close();

      const listings = processListings(data);

      const dateTime = DateTime.now().toLocaleString(DateTime.DATETIME_FULL);

      if (!prevListings[item]) {
        console.log(`Checking for "${item}"... Populating the listing for the first time!`);
      } else {
        const diffListings = getNewListings(prevListings[item], listings);

        if (diffListings.length === 0) {
          console.log(`${dateTime}\t There is no update for "${item}"...`);
        } else {
          console.log(`${dateTime}\t There is an update for "${item}"!!`);
          const messages = createListingsMessages(diffListings);
          console.log(messages);

          await telegramBotSendText(messages);
        }
      }

      prevListings[item] = listings;
    }
  } catch (e) {
    console.log(e);
  } finally {
    await browser.close();
  }
}

async function setPageSettings(page) {
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3419.0 Safari/537.36"
  );
  await page.setCacheEnabled(false);
  await page.setRequestInterception(true);

  page.on("request", (req) => {
    if (req.resourceType() === "document") {
      req.continue();
    } else {
      req.abort();
    }
  });
}

function processListings(data) {
  return data.SearchListing.listingCards
    .filter((element) => {
      return (
        element.hasOwnProperty("listingID") &&
        element.listingID !== 0 &&
        !element.aboveFold[0].component === "active_bump" &&
        !element.hasOwnProperty("promoted")
      );
    })
    .map((element) => {
      const listingID = element.listingID;
      const name = element.belowFold[0].stringContent;
      const price = element.belowFold[1].stringContent;
      const condition = element.belowFold[2].stringContent;
      const thumbnailURL = element.thumbnailURL;
      const sellerUsername =
        data.Listing.listingsMap[element.listingID].seller.username;
      const itemURL = `https://sg.carousell.com/p/${name
        .replace(/[^a-zA-Z ]/g, "-")
        .replace(/ /g, "-")}-${listingID}`;
      const timestamp = element.aboveFold[0].timestampContent.seconds.low;

      return {
        listingID,
        name,
        price,
        condition,
        thumbnailURL,
        sellerUsername,
        itemURL,
        timestamp,
      };
    });
}

async function telegramBotSendText(messages) {
  for (const message of messages) {
    const sendText = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${botChatID}&parse_mode=html&text=${encodeURI(
      message
    )}`;

    try {
      const response = await axios.get(sendText);
      console.log(response.data.result.text + "\n");
    } catch (error) {
      console.log(error.config.url);
    }
  }
}

function getNewListings(prevListings, currentListings) {
  const latestTimestamp = Math.max(...prevListings.map(({ timestamp }) => timestamp));
  return currentListings.filter(({ timestamp }) => timestamp > latestTimestamp);
}

function createListingsMessages(listings) {
  const messages = [];

  for (const listing of listings) {
    let message = "";
    message += "Name: " + listing.name + "\n";
    message += "Price: " + listing.price + "\n";
    message += "Condition: " + listing.condition + "\n";
    message += "Seller Username: " + listing.sellerUsername + "\n";
    message += "Thumbnail: " + listing.thumbnailURL + "\n";
    message += "Item Link: " + listing.itemURL + "\n";
    messages.push(message);
  }

  return messages;
}

job.start();
