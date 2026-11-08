import type { IFakePlace } from "../interfaces/fake-place.interface.ts";

export const SERVICE_AREA_PLACES = {
  JERUSALEM_PARAN: {
    city: "ירושלים",
    mainText: "פארן 1",
    placeId:
      "EhVQYXJhbiBTdCAxLCBKZXJ1c2FsZW0iMBIuChQKEglpo8HD8SkDFRH3SsOEUFmb3xABKhQKEgkdc1_d7ykDFRHeHDw7HZSj-A",
    secondaryText: "ירושלים",
    formattedAddress: "פארן 1, ירושלים",
    countryCode: null,
    location: { latitude: 31.8012148, longitude: 35.2299901 },
  },
  ALMON: {
    city: "עלמון",
    countryCode: "PS",
    mainText: "עלמון",
    placeId: "fake_place_almon",
    secondaryText: "ענתות",
    formattedAddress: "עלמון, ענתות",
  },
  ANATOT: {
    city: "ענתות",
    countryCode: "PS",
    mainText: "ענתות",
    placeId: "fake_place_anatot",
    secondaryText: "עלמון",
    formattedAddress: "ענתות, עלמון",
  },
  UNSUPPORTED: {
    city: "עמאן",
    countryCode: "JO",
    mainText: "עמאן",
    placeId: "fake_place_outside_service_area",
    secondaryText: "JO",
    formattedAddress: "עמאן, JO",
  },
  NO_COUNTRY: {
    city: "ללא מדינה",
    countryCode: "",
    mainText: "ללא מדינה",
    placeId: "fake_place_without_country",
    secondaryText: "",
    formattedAddress: "כתובת ללא מדינה",
  },
  NO_CITY: {
    city: "",
    countryCode: "PS",
    mainText: "כביש ללא יישוב",
    placeId: "fake_place_service_area_road",
    secondaryText: "PS",
    formattedAddress: "כביש ללא יישוב, PS",
  },
} as const satisfies Record<string, IFakePlace>;

export const FAKE_PLACES: IFakePlace[] = [
  {
    city: "תל אביב-יפו",
    mainText: "הרצל 12",
    placeId: "fake_place_herzl_12",
    secondaryText: "תל אביב-יפו, ישראל",
    formattedAddress: "הרצל 12, תל אביב-יפו, ישראל",
  },
  {
    city: "חיפה",
    mainText: "הנביאים 5",
    placeId: "fake_place_hanevim_5",
    secondaryText: "חיפה, ישראל",
    formattedAddress: "הנביאים 5, חיפה, ישראל",
  },
];

export const FAKE_PLACES_ROUTES = {
  PLACE_PREFIX: "/v1/places/",
  AUTOCOMPLETE: "/v1/places:autocomplete",
} as const;
