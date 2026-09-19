export { dealerInventoryFeedV1 } from "../src/config/dealer-inventory-sample.ts";

export const dealerInventoryFeedV2 = `stock_number,vin,year,make,model,trim,price,mileage,city,state,postal_code,status,body_style,transmission,drivetrain,fuel_type,exterior_color,title_status,description,photos
GS-1001,1HGCM82633A004352,2022,Toyota,Tacoma,TRD Sport,35995,29100,Boise,ID,83702,available,Truck,Automatic,4WD,Gas,Blue,Clean,One-owner Tacoma with updated pricing.,https://images.example.test/gs-1001-front.jpg|https://images.example.test/gs-1001-side-updated.jpg
GS-1002,1C4HJXDG4JW123456,2021,Jeep,Wrangler,Unlimited Sport,31900,44100,Nampa,ID,83651,available,SUV,Automatic,4WD,Gas,Green,Clean,Trail-ready Wrangler with removable top.,https://images.example.test/gs-1002-front.jpg
GS-1005,1G1ZE5ST0HF123456,2017,Chevrolet,Malibu,LT,14900,88400,Caldwell,ID,83605,pending,Sedan,Automatic,FWD,Gas,Silver,Clean,Newly acquired sedan awaiting final inspection.,https://images.example.test/gs-1005-front.jpg`;

export const dealerInventoryFeedWithErrors = `stock_number,vin,year,make,model,trim,price,mileage,city,state,postal_code,status,photos
GS-2001,1HGCM82633A004352,2022,Toyota,Tacoma,TRD Sport,36995,28400,Boise,ID,83702,available,https://images.example.test/valid.jpg
GS-2001,1C4HJXDG4JW123456,2021,Jeep,Wrangler,Unlimited Sport,31900,44100,Nampa,ID,83651,available,https://images.example.test/duplicate.jpg
GS-2003,NOT-A-VIN,2020,Ford,F-150,Lariat,42900,51600,Meridian,ID,83642,available,https://images.example.test/invalid-vin.jpg
GS-2004,1FTFW1ET5MFA12346,2020,Ford,F-150,Lariat,,51600,Meridian,ID,83642,available,not-a-photo-url`;

export const dealerInventoryEmptyFeed = `stock_number,vin,year,make,model,price,city,state
,,,,,,,`;
