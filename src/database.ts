// database.ts
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const dbPath = path.resolve(__dirname, 'property_database.sqlite');

export async function initializeDatabase() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

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

export let db: Awaited<ReturnType<typeof open>>;

initializeDatabase().then((database) => {
  db = database;
  console.log('Database initialized');
});