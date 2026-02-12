import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Image } from "image-js";
import parsePhoneNumber from "libphonenumber-js";
import { zeroDecimalCurrencies } from "@/lib/constant";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Helper function to build the URL with query parameters
export function buildUrlWithParams(baseUrl, queryParams) {
  const queryString = Object.entries(queryParams)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

export function convertSecondsToHoursMinutes(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}min`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}

export async function resizeImage(file, targetWidth = 800) {
  try {
    // Step 1: Convert the file to an array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Step 2: Load the image from the array buffer
    const image = await Image.load(arrayBuffer);

    // Step 3: Resize the image
    const resizedImage = image.resize({ width: targetWidth });

    // Step 4: Convert the resized image to a Blob (image file)
    const resizedBlob = await resizedImage.toBlob("image/jpeg");

    // Step 5: Return the resized image as a Blob (file)
    return resizedBlob;
  } catch (error) {
    console.error("Error resizing image:", error);
    throw new Error("Image resizing failed");
  }
}

export function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;
  return arr1.every((value, index) => value === arr2[index]);
}

export function getLocalizedValue(doc, field, language = "en") {
  if (!doc || !field) {
    throw new Error("Document and field are required");
  }

  // Determine the field name based on the language
  const localizedField = language === "es" ? `${field}ES` : field;

  // Return the value from the document
  return doc[localizedField] || "";
}

export function getInitials(firstName, lastName) {
  if (!firstName && !lastName) {
    return "";
  }

  let initials = "";

  if (firstName) {
    initials += firstName.charAt(0).toUpperCase();
  }

  if (lastName) {
    initials += lastName.charAt(0).toUpperCase();
  }

  return initials;
}

export function getLast30Days() {
  const dates = [];
  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() - 29); // Start date is 29 days before today

  // Zero out hours, minutes, seconds, milliseconds
  startDate.setHours(0, 0, 0, 0);

  let currentDate = new Date(startDate);

  while (currentDate <= today) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(0, 0, 0, 0); // Zero out time after setting the new date
  }

  return dates;
}

function getDaySuffix(day) {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function formatDate(date) {
  const day = date.getDate();
  const month = date.toLocaleString("default", { month: "long" });
  const year = date.getFullYear();

  const daySuffix = getDaySuffix(day);

  return `${day}${daySuffix} ${month}, ${year}`;
}

export function formatPhoneNumber({ countryCode, phoneNumberString }) {
  if (!phoneNumberString) return null;

  try {
    // Extract country code digits from countryCode (e.g., "+1" -> "1", "+44" -> "44")
    const countryCodeDigits = countryCode ? countryCode.replace(/\D/g, "") : null;

    // Construct the full international number
    let fullNumber = phoneNumberString;

    // Check if the number already starts with + (international format)
    const isAlreadyInternational = phoneNumberString.trim().startsWith("+");

    // If country code is provided and number is not already in international format
    if (countryCodeDigits && !isAlreadyInternational) {
      // Ensure country code has + prefix
      const formattedCountryCode = countryCode.startsWith("+")
        ? countryCode
        : `+${countryCodeDigits}`;

      // Combine country code with phone number
      fullNumber = `${formattedCountryCode}${phoneNumberString}`;
    }

    // Parse the phone number
    const phoneNumber = parsePhoneNumber(fullNumber);

    if (phoneNumber && phoneNumber.isValid()) {
      // Format in national format (locale-specific)
      // This will format according to the country's local conventions
      return phoneNumber.formatNational();
    }

    // If not valid, try to format anyway (might be a possible number)
    if (phoneNumber && phoneNumber.isPossible()) {
      return phoneNumber.formatNational();
    }

    // Fallback: If parsing fails, try with just the number
    // Remove any leading zeros or country codes from the number
    const cleanedNumber = phoneNumberString.replace(/^0+/, "").replace(/\D/g, "");

    if (countryCodeDigits && cleanedNumber) {
      const fallbackNumber = parsePhoneNumber(`+${countryCodeDigits}${cleanedNumber}`);
      if (fallbackNumber) {
        return fallbackNumber.formatNational();
      }
    }

    // Last resort: return formatted with country code
    if (countryCodeDigits) {
      const formattedCountryCode = countryCode.startsWith("+")
        ? countryCode
        : `+${countryCodeDigits}`;
      return `${formattedCountryCode} ${phoneNumberString}`;
    }

    return phoneNumberString;
  } catch (error) {
    // If parsing fails, return the original number or formatted with country code
    const countryCodeDigits = countryCode ? countryCode.replace(/\D/g, "") : null;
    if (countryCodeDigits) {
      const formattedCountryCode = countryCode.startsWith("+")
        ? countryCode
        : `+${countryCodeDigits}`;
      return `${formattedCountryCode} ${phoneNumberString}`;
    }
    return phoneNumberString;
  }
}

export function getTranslation(translations, languageCode) {
  if (!translations || typeof translations !== "object") {
    throw new Error("Invalid translations object");
  }

  // Return the requested language if it exists, fallback to 'en' if not.
  return translations[languageCode] || "";
}

export function formatCurrency(amount, currencyCode = "USD") {
  if (!amount) return "";

  if (typeof amount !== "number") {
    throw new Error("Amount must be a number");
  }
  if (typeof currencyCode !== "string") {
    throw new Error("Currency code must be a string");
  }

  const browserLocale = navigator.language;

  try {
    // Check if the currency is zero-decimal
    const isZeroDecimal = zeroDecimalCurrencies.includes(
      currencyCode.toUpperCase()
    );

    // Convert amount to major unit if necessary
    const majorUnitAmount = isZeroDecimal ? amount : amount / 100;

    // Format the amount
    return new Intl.NumberFormat(browserLocale, {
      style: "currency",
      currency: currencyCode,
    }).format(majorUnitAmount);
  } catch (error) {
    console.error("Invalid currency code:", currencyCode);
    return null;
  }
}

export function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.src = url;

    video.onloadedmetadata = () => {
      resolve(video.duration);
      URL.revokeObjectURL(url);
    };

    video.onerror = (error) => {
      console.error("Error loading video metadata:", error);
      reject(
        new Error(
          `Error while getting duration: ${error.message || error.type}`
        )
      );
    };
  });
}
