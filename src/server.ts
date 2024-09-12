/**
 * Setup express server.
 */

import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import helmet from 'helmet';
import express, { Request, Response, NextFunction } from 'express';
import logger from 'jet-logger';

import 'express-async-errors';

import BaseRouter from '@src/routes';

import Paths from '@src/common/Paths';
import EnvVars from '@src/common/EnvVars';
import HttpStatusCodes from '@src/common/HttpStatusCodes';
import { RouteError } from '@src/common/classes';
import { NodeEnvs } from '@src/common/misc';

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';



// **** Variables **** //

const app = express();


// **** Setup **** //

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(EnvVars.CookieProps.Secret));

// Show routes called in console during development
if (EnvVars.NodeEnv === NodeEnvs.Dev.valueOf()) {
  app.use(morgan('dev'));
}

// Security
if (EnvVars.NodeEnv === NodeEnvs.Production.valueOf()) {
  app.use(helmet());
}

// Add APIs, must be after middleware
app.use(Paths.Base, BaseRouter);

// Add error handler
app.use((
  err: Error,
  _: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
) => {
  if (EnvVars.NodeEnv !== NodeEnvs.Test.valueOf()) {
    logger.err(err, true);
  }
  let status = HttpStatusCodes.BAD_REQUEST;
  if (err instanceof RouteError) {
    status = err.status;
  }
  return res.status(status).json({ error: err.message });
});


// **** Front-End Content **** //

// Set views directory (html)
const viewsDir = path.join(__dirname, 'views');
app.set('views', viewsDir);

// Set static directory (js and css).
const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir));

// Database file path
const dbPath = path.resolve(__dirname, 'property_database.sqlite');

// Type definition for the view results
interface PropertyLocation {
  property_id: number;
  title: string;
  description: string | null;
  price: number;
  square_feet: number;
  bedrooms: number | null;
  bathrooms: number | null;
  property_type: 'apartment' | 'house';
  listing_type: 'rent' | 'sale';
  location_id: number;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
}

// Function to initialize the database
async function initializeDatabase() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  // Ensure the database connection is established
  await db.exec(`
      CREATE TABLE IF NOT EXISTS locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          street_address VARCHAR(255) NOT NULL,
          city VARCHAR(100) NOT NULL,
          state VARCHAR(50) NOT NULL,
          zip_code VARCHAR(20) NOT NULL,
          country VARCHAR(50) NOT NULL,
          latitude DECIMAL(10, 8),
          longitude DECIMAL(11, 8)
      );
  `);

  await db.exec(`
      CREATE TABLE IF NOT EXISTS images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          image_url VARCHAR(255) NOT NULL,
          is_primary BOOLEAN DEFAULT FALSE
      );
  `);
  await db.exec(`
      CREATE TABLE IF NOT EXISTS properties (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          price DECIMAL(10, 2) NOT NULL,
          square_feet INT NOT NULL,
          bedrooms INTEGER,
          bathrooms INTEGER,
          property_type TEXT NOT NULL,
          listing_type TEXT NOT NULL,
          location_id INTEGER,
          image_id INTEGER,
          FOREIGN KEY (location_id) REFERENCES locations(id),
          FOREIGN KEY (image_id) REFERENCES images(id)
      );
  `);

  // Create the view if it doesn't exist
  await db.exec(`
    CREATE VIEW IF NOT EXISTS property_location_view AS
    SELECT 
      p.id AS property_id,
      p.title,
      p.description,
      p.price,
      p.square_feet,
      p.bedrooms,
      p.bathrooms,
      p.property_type,
      p.listing_type,
      l.id AS location_id,
      l.street_address,
      l.city,
      l.state,
      l.zip_code,
      l.country,
      l.latitude,
      l.longitude
    FROM 
      properties p
    JOIN 
      locations l ON p.location_id = l.id;
  `);

  return db;
}

// Initialize the database when the server starts
let db: Awaited<ReturnType<typeof open>>;
initializeDatabase().then((database) => {
  db = database;
  console.log('Database initialized');
});

app.get('/api/properties', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM property_location_view');
    res.json(rows as PropertyLocation[]);
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// **** Export default **** //

export default app;
