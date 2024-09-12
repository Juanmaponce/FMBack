import puppeteer from "puppeteer";
import fs from "fs";
import path from 'path';

// import { parse } from "json2csv";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { db } from "./database";
// todo:
// bring URL and URLPrefix from env
// add crawler to get description

enum ListingType {
  RENT = "RENT",
  SALE = "SALE",
}
enum PropertyType {
  HOUSE = "HOUSE",
  APARTMENT = "APARTMENT",
}
interface Property {
  price: string;
  detailUrl: string;
  bedrooms: string;
  bathrooms: string;
  squareMeters: string;
  // description: string;
  // age: string;
  // state: string;
  address: string;
  listingType: ListingType;
  propertyType: PropertyType;
}

const selectors = {
  propertyContainer: "article.item",
  price: ".price",
  detailLink: "[itemprop='url']",
  bedrooms: ".label-dormitorio",
  bathrooms: ".label-banio",
  squareMeters: ".label-sup-total",
  description: ".description > p",
  address: "[itemprop='streetAddress']",
};

function getListingTypeFromUrl(url: string): ListingType {
  if (url.includes("alquiler")) {
    return ListingType.RENT;
  } else if (url.includes("venta")) {
    return ListingType.SALE;
  } else {
    throw new Error("Unknown listing type in URL");
  }
}

function getPropertyTypeFromUrl(url: string): PropertyType {
  if (url.includes("casa")) {
    return PropertyType.HOUSE;
  } else if (url.includes("departamento")) {
    return PropertyType.APARTMENT;
  } else {
    throw new Error("Unknown property type in URL");
  }
}

async function initializeDatabase() {
//   const db = await open({
//     filename: "./property_database.sqlite",
//     driver: sqlite3.Database,
//   });
const dbPath = path.resolve(__dirname, 'property_database.sqlite');

const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

//   await db.exec(`
//     CREATE TABLE IF NOT EXISTS locations (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       street_address TEXT NOT NULL,
//       city TEXT NOT NULL,
//       state TEXT NOT NULL,
//       zip_code TEXT NOT NULL,
//       country TEXT NOT NULL,
//       latitude REAL,
//       longitude REAL
//     );

//     CREATE TABLE IF NOT EXISTS images (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       image_url TEXT NOT NULL,
//       is_primary BOOLEAN DEFAULT FALSE
//     );

//     CREATE TABLE IF NOT EXISTS properties (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       title TEXT NOT NULL,
//       description TEXT,
//       price TEXT NOT NULL,
//       square_meters INTEGER,
//       bedrooms INTEGER,
//       bathrooms INTEGER,
//       property_type TEXT NOT NULL,
//       listing_type TEXT NOT NULL,
//       location_id INTEGER,
//       image_id INTEGER,
//       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//       FOREIGN KEY (location_id) REFERENCES locations(id),
//       FOREIGN KEY (image_id) REFERENCES images(id)
//     );
//   `);

  return db;
}

async function insertProperty(db: any, property: Property) {
  // where to get city, state, etc?

  try {
    const { lastID: locationId } = await db.run(
      "INSERT INTO locations (street_address, city, state, zip_code, country) VALUES (?, ?, ?, ?, ?)",
      [property.address, "Unknown", "Unknown", "Unknown", "Argentina"]
    );

    console.log("property.squareMeters");
    console.log(property.squareMeters);
    console.log("falopiada");
    console.log(property.price);
    // Insert property
    await db.run(
      `INSERT INTO properties
      (title, description, price, square_meters, bedrooms, bathrooms, property_type, listing_type, location_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${property.propertyType} for ${property.listingType}`,
        "",
        // parseFloat(property.price.replace(/[^\d.-]/g, "")),
        property.price,
        // parseInt(property.squareMeters),
        parseInt(property.squareMeters.replace(/m2$|[^\d.-]/g, "")),
        parseInt(property.bedrooms),
        parseInt(property.bathrooms),
        property.propertyType,
        property.listingType,
        locationId,
      ]
    );
  } catch (e) {
    console.error("Error inserting property", e);
  }
}

async function scrapePropertyList(
  page: any,
  listingType: ListingType
): Promise<Property[]> {
  return await page.evaluate(
    (sel: {
      propertyContainer: string;
      price: string;
      detailLink: string;
      bedrooms: string;
      bathrooms: string;
      squareMeters: string;
      address: string;
      listingType: ListingType;
    }) => {
      const elements = document.querySelectorAll(sel.propertyContainer);
      return Array.from(elements).map((element) => {
        const detailUrl =
          element.querySelector(sel.detailLink)?.getAttribute("href") || "";
        return {
          price: element.querySelector(sel.price)?.textContent?.trim() || "",
          detailUrl:
            element.querySelector(sel.detailLink)?.getAttribute("href") || "",
          bedrooms:
            element.querySelector(sel.bedrooms)?.textContent?.trim() || "",
          bathrooms:
            element.querySelector(sel.bathrooms)?.textContent?.trim() || "",
          squareMeters:
            element.querySelector(sel.squareMeters)?.textContent?.trim() || "",
          address:
            element.querySelector(sel.address)?.textContent?.trim() || "",
          listingType: sel.listingType,
          // propertyType: getPropertyTypeFromUrl(detailUrl),
          propertyType: detailUrl.includes("casa") ? "HOUSE" : "APARTMENT",
        };
      });
    },
    { ...selectors, listingType }
  );
}

// async function scrapePropertyDetails(
//   page: any,
//   url: string
// ): Promise<Partial<Property>> {
//   await page.goto(url);

//   const details = await page.evaluate(
//     (sel: { description: any; squareMeters: any; age: any; state: any }) => ({
//       description:
//         document.querySelector(sel.description)?.textContent?.trim() || "",
//       // squareMeters:
//       //   document.querySelector(sel.squareMeters)?.textContent?.trim() || "",
//       // age: document.querySelector(sel.age)?.textContent?.trim() || "",
//       // state: document.querySelector(sel.state)?.textContent?.trim() || "",
//     }),
//     selectors
//   );

//   return details;
// }

async function scrapeRealEstate(url: string) {
  const browser = await puppeteer.launch({
    ignoreDefaultArgs: ['--disable-extensions'],
  });
  const page = await browser.newPage();
//   const db = await initializeDatabase();

  // set vey large  timeout to get big amount of data
  page.setDefaultNavigationTimeout(60000);

  await page.goto(url);

  const listingType = getListingTypeFromUrl(url);

  const properties = await scrapePropertyList(page, listingType);

  // Uncomment the following block to scrape details from individual property pages
  /*
  for (const prop of properties) {
    if (prop.detailUrl) {
      const details = await scrapePropertyDetails(
        page,
        `https://inmoup.com.ar/${prop.detailUrl}`
      );
      Object.assign(prop, details);
    }
  }
  */

  for (const property of properties) {
    await insertProperty(db, property);
  }

  await browser.close();

  console.log("Scraped properties:");
  console.log(properties);

  // const csv = parse(properties, {
  //   fields: [
  //     "price",
  //     "detailUrl",
  //     "bedrooms",
  //     "bathrooms",
  //     "squareMeters",
  //     "address",
  //     "listingType",
  //     "propertyType",
  //     // "description",
  //     // "age",
  //     // "state",
  //   ],
  //   header: true,
  //   quote: '"',
  //   delimiter: ",",
  // });

  // fs.writeFileSync("real_estate_data.csv", csv + "\n");

  console.log("Scraping completed. Data saved to real_estate_data.csv");
}

const targetUrl =
  "https://inmoup.com.ar/departamentos-en-alquiler?favoritos=0&limit=100&prevEstadoMap=&localidades=19%2C1%2C2%2C8&lastZoom=13&precio[min]=0&precio[max]=0&moneda=1&sup_cubierta[min]=&sup_cubierta[max]=&expensas[min]=&expensas[max]=";

async function main() {
  await scrapeRealEstate(targetUrl);
}

main();