CREATE DATABASE IF NOT EXISTS ecodrive_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ecodrive_db;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name VARCHAR(80) NOT NULL,
  middle_initial VARCHAR(3) NULL,
  last_name VARCHAR(80) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address VARCHAR(255) NOT NULL,
  avatar_data_url MEDIUMTEXT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  is_blocked TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  KEY idx_users_role_blocked (role, is_blocked),
  KEY idx_users_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_data_url MEDIUMTEXT NULL AFTER address;

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id VARCHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  model VARCHAR(180) NOT NULL,
  bike_image VARCHAR(255) NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  shipping_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(80) NOT NULL,
  service_type VARCHAR(40) NOT NULL,
  status VARCHAR(80) NOT NULL DEFAULT 'Pending review',
  fulfillment_status VARCHAR(80) NOT NULL DEFAULT 'In Process',
  shipping_address VARCHAR(255) NULL,
  shipping_lat DECIMAL(10,6) NULL,
  shipping_lng DECIMAL(10,6) NULL,
  shipping_map_embed_url TEXT NULL,
  user_email VARCHAR(190) NULL,
  installment_payload LONGTEXT NULL,
  review_decision ENUM('approved', 'rejected', 'none') NOT NULL DEFAULT 'none',
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_order_id (order_id),
  KEY idx_bookings_email (email),
  KEY idx_bookings_user_email (user_email),
  KEY idx_bookings_review_decision (review_decision),
  KEY idx_bookings_created_at (created_at),
  CONSTRAINT fk_bookings_user_id
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  model VARCHAR(180) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  category ENUM('2-Wheel', '3-Wheel', '4-Wheel', 'Other') NOT NULL DEFAULT 'Other',
  product_info VARCHAR(255) NULL,
  image_url MEDIUMTEXT NULL,
  detail_url VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_model_category (model, category),
  KEY idx_products_active_category (is_active, category),
  KEY idx_products_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_info VARCHAR(255) NULL AFTER category;

ALTER TABLE products
  MODIFY COLUMN image_url MEDIUMTEXT NULL;

INSERT IGNORE INTO products (model, price, category, product_info, image_url, detail_url, is_active) VALUES
  ('BLITZ 2000', 68000.00, '2-Wheel', NULL, '/Userhomefolder/image 1.png', '/Userhomefolder/Ebikes/ebike1.0.html', 1),
  ('BLITZ 1200', 45000.00, '2-Wheel', NULL, '/Userhomefolder/image 2.png', '/Userhomefolder/Ebikes/ebike2.0.html', 1),
  ('FUN 1500 FI', 74000.00, '2-Wheel', NULL, '/Userhomefolder/image 3.png', '/Userhomefolder/Ebikes/ebike3.0.html', 1),
  ('CANDY 800', 58000.00, '2-Wheel', NULL, '/Userhomefolder/image 4.png', '/Userhomefolder/Ebikes/ebike4.0.html', 1),
  ('BLITZ 200R', 74000.00, '2-Wheel', NULL, '/Userhomefolder/image 5.png', '/Userhomefolder/Ebikes/ebike5.0.html', 1),
  ('TRAVELLER 1500', 79000.00, '2-Wheel', NULL, '/Userhomefolder/image 6.png', '/Userhomefolder/Ebikes/ebike6.0.html', 1),
  ('ECONO 500 MP', 51500.00, '2-Wheel', NULL, '/Userhomefolder/image 7.png', '/Userhomefolder/Ebikes/ebike7.0.html', 1),
  ('ECONO 350 MINI-II', 58000.00, '2-Wheel', NULL, '/Userhomefolder/image 8.png', '/Userhomefolder/Ebikes/ebike8.0.html', 1),
  ('ECARGO 100', 72500.00, '3-Wheel', NULL, '/Userhomefolder/image 9.png', '/Userhomefolder/Ebikes/ebike9.0.html', 1),
  ('ECONO 650 MP', 65000.00, '3-Wheel', NULL, '/Userhomefolder/image 10.png', '/Userhomefolder/Ebikes/ebike10.0.html', 1),
  ('ECAB 100V V2', 51500.00, '3-Wheel', NULL, '/Userhomefolder/image 11.png', '/Userhomefolder/Ebikes/ebike11.0.html', 1),
  ('ECONO 800 MP II', 67000.00, '3-Wheel', NULL, '/Userhomefolder/image 12.png', '/Userhomefolder/Ebikes/ebike12.0.html', 1),
  ('E-CARGO 800', 205000.00, '4-Wheel', NULL, '/Userhomefolder/image 13.png', '/Userhomefolder/Ebikes/ebike13.0.html', 1),
  ('E-CAB MAX 1500', 130000.00, '4-Wheel', NULL, '/Userhomefolder/image 14.png', '/Userhomefolder/Ebikes/ebike14.0.html', 1),
  ('E-CAB 1000', 75000.00, '4-Wheel', NULL, '/Userhomefolder/image 15.png', '/Userhomefolder/Ebikes/ebike15.0.html', 1),
  ('ECONO 800 MP', 100000.00, '4-Wheel', NULL, '/Userhomefolder/image 16.png', '/Userhomefolder/Ebikes/ebike16.0.html', 1);
