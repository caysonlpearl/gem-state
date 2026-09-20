export const dealerInventoryFeedV1 = `stock_number,vin,year,make,model,trim,price,mileage,city,state,postal_code,status,body_style,transmission,drivetrain,fuel_type,exterior_color,title_status,description,photos
GS-1001,1HGCM82633A004352,2022,Toyota,Tacoma,TRD Sport,36995,28400,Boise,ID,83702,available,Truck,Automatic,4WD,Gas,Blue,Clean,One-owner Tacoma with a full service history.,https://images.example.test/gs-1001-front.jpg|https://images.example.test/gs-1001-side.jpg
GS-1002,1C4HJXDG4JW123456,2021,Jeep,Wrangler,Unlimited Sport,31900,44100,Nampa,ID,83651,available,SUV,Automatic,4WD,Gas,Green,Clean,Trail-ready Wrangler with removable top.,https://images.example.test/gs-1002-front.jpg
GS-1003,1FTFW1ET5MFA12345,2020,Ford,F-150,Lariat,42900,51600,Meridian,ID,83642,available,Truck,Automatic,4WD,Gas,White,Clean,Loaded half-ton pickup with towing package.,https://images.example.test/gs-1003-front.jpg
GS-1004,5NMS3CAD2KH123456,2019,Hyundai,Santa Fe,SEL,21900,70200,Eagle,ID,83616,sold,SUV,Automatic,AWD,Gas,Gray,Clean,Sold vehicle retained in the source history.,https://images.example.test/gs-1004-front.jpg`;

export const dealerInventoryFeedJsonV1 = JSON.stringify(
  [
    {
      stockNumber: "GS-1001",
      vin: "1HGCM82633A004352",
      year: 2022,
      make: "Toyota",
      model: "Tacoma",
      trim: "TRD Sport",
      price: 36995,
      mileage: 28400,
      city: "Boise",
      state: "ID",
      postalCode: "83702",
      status: "available",
      bodyStyle: "Truck",
      transmission: "Automatic",
      drivetrain: "4WD",
      fuelType: "Gas",
      exteriorColor: "Blue",
      titleStatus: "Clean",
      description: "One-owner Tacoma with a full service history.",
      photos: [
        "https://images.example.test/gs-1001-front.jpg",
        "https://images.example.test/gs-1001-side.jpg",
      ],
    },
  ],
  null,
  2,
);

export const dealerInventoryFeedXmlV1 = `<inventory>
  <vehicle>
    <stock_number>GS-1001</stock_number>
    <vin>1HGCM82633A004352</vin>
    <year>2022</year>
    <make>Toyota</make>
    <model>Tacoma</model>
    <trim>TRD Sport</trim>
    <price>36995</price>
    <mileage>28400</mileage>
    <city>Boise</city>
    <state>ID</state>
    <postal_code>83702</postal_code>
    <status>available</status>
    <body_style>Truck</body_style>
    <transmission>Automatic</transmission>
    <drivetrain>4WD</drivetrain>
    <fuel_type>Gas</fuel_type>
    <exterior_color>Blue</exterior_color>
    <title_status>Clean</title_status>
    <description><![CDATA[One-owner Tacoma with a full service history.]]></description>
    <photos>
      <photo>https://images.example.test/gs-1001-front.jpg</photo>
      <photo>https://images.example.test/gs-1001-side.jpg</photo>
    </photos>
  </vehicle>
</inventory>`;
