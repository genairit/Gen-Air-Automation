import type { IFakePlace } from "../interfaces/fake-place.interface.ts";

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
