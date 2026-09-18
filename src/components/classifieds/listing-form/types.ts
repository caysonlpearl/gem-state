export type ListingFormState = {
  title: string;
  description: string;
  category: string;
  price: string;
  condition: string;
  sellerNote: string;
  state: string;
  region: string;
  city: string;
  postalCode: string;
  fulfillmentMode: string;
  length: string;
  width: string;
  height: string;
  weight: string;

  // Vehicle
  make: string;
  model: string;
  year: string;
  trim: string;
  mileage: string;
  bodyStyle: string;
  transmission: string;
  drivetrain: string;
  fuelType: string;
  exteriorColor: string;
  titleStatus: string;
  vin: string;

  // Home
  homeMode: string;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  yearBuilt: string;
  acreage: string;
  heating: string;
  cooling: string;
  garageParking: string;
  yard: string;
  appliancesIncluded: string;
  floorCoverings: string;
  basementType: string;
  exteriorMaterial: string;
  specialFeatures: string;
  hoaFees: string;
  schoolDistrict: string;
  leaseLength: string;
  available: string;
  petsPolicy: string;
  smokingPolicy: string;
  openHouse: string;

  // Job
  employerName: string;
  employerAddress: string;
  payType: string;
  payMin: string;
  payMax: string;
  employmentType: string;
  experienceRequired: string;
  educationLevel: string;
  responsibilities: string;
  qualifications: string;

  // Service
  subcategory: string;
  serviceArea: string;
  availability: string;
  businessAddress: string;
  licenseNumber: string;
  licenseLookupUrl: string;
  offerings: string;
};

export const initialListingForm: ListingFormState = {
  title: "",
  description: "",
  category: "",
  price: "",
  condition: "used_good",
  sellerNote: "",
  state: "ID",
  region: "Treasure Valley",
  city: "",
  postalCode: "",
  fulfillmentMode: "local_pickup",
  length: "",
  width: "",
  height: "",
  weight: "",

  make: "",
  model: "",
  year: "",
  trim: "",
  mileage: "",
  bodyStyle: "",
  transmission: "Automatic",
  drivetrain: "",
  fuelType: "Gasoline",
  exteriorColor: "",
  titleStatus: "Clean",
  vin: "",

  homeMode: "buy",
  propertyType: "Single-family home",
  bedrooms: "",
  bathrooms: "",
  squareFeet: "",
  yearBuilt: "",
  acreage: "",
  heating: "",
  cooling: "",
  garageParking: "",
  yard: "",
  appliancesIncluded: "",
  floorCoverings: "",
  basementType: "",
  exteriorMaterial: "",
  specialFeatures: "",
  hoaFees: "",
  schoolDistrict: "",
  leaseLength: "",
  available: "",
  petsPolicy: "",
  smokingPolicy: "",
  openHouse: "",

  employerName: "",
  employerAddress: "",
  payType: "Hourly",
  payMin: "",
  payMax: "",
  employmentType: "Full-time",
  experienceRequired: "",
  educationLevel: "",
  responsibilities: "",
  qualifications: "",

  subcategory: "",
  serviceArea: "",
  availability: "",
  businessAddress: "",
  licenseNumber: "",
  licenseLookupUrl: "",
  offerings: "",
};
