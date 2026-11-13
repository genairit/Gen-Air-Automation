import {
  FAKE_PLACES,
  FAKE_PLACES_ROUTES,
  SERVICE_AREA_PLACES,
} from "../constants/fake-places.constant.ts";

import { json } from "node:stream/consumers";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_STATUS } from "../constants/http.constant.ts";
import { createLogger } from "../utilities/logger.utility.ts";
import type { IFakePlace } from "../interfaces/fake-place.interface.ts";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

const JSON_HEADERS = { "Content-Type": "application/json" };

const COUNTRY = { CODE: "IL" } as const;
const ALL_PLACES = [...FAKE_PLACES, ...Object.values(SERVICE_AREA_PLACES)];
const logger = createLogger("Fake Places");

const countryCode = (place: IFakePlace) => place.countryCode ?? COUNTRY.CODE;

const toPrediction = (place: IFakePlace) => ({
  placePrediction: {
    placeId: place.placeId,
    text: { text: place.formattedAddress },
    structuredFormat: {
      mainText: { text: place.mainText },
      secondaryText: { text: place.secondaryText },
    },
  },
});

const toPlaceDetails = (place: IFakePlace) => ({
  id: place.placeId,
  formattedAddress: place.formattedAddress,
  ...(place.location ? { location: place.location } : {}),
  addressComponents: [
    { types: ["locality"], longText: place.city, shortText: place.city },
    ...(place.countryCode === null
      ? []
      : [{ types: ["country"], longText: countryCode(place), shortText: countryCode(place) }]),
  ],
});

const sendJson = (response: ServerResponse, status: number, body: object) => {
  response.writeHead(status, JSON_HEADERS);
  response.end(JSON.stringify(body));
};

const findPlace = (url: string) => {
  const [path] = url.split("?");
  const placeId = decodeURIComponent(path.slice(FAKE_PLACES_ROUTES.PLACE_PREFIX.length));

  return ALL_PLACES.find(place => place.placeId === placeId) ?? null;
};

const answerPlaceDetails = (request: IncomingMessage, response: ServerResponse) => {
  const place = findPlace(request.url ?? "");

  if (!place) {
    sendJson(response, HTTP_STATUS.NOT_FOUND, { error: { status: "NOT_FOUND" } });

    return;
  }

  sendJson(response, HTTP_STATUS.OK, toPlaceDetails(place));
};

const answerAutocomplete = async (request: IncomingMessage, response: ServerResponse) => {
  const body: unknown = await json(request);
  const regions =
    isRecord(body) && Array.isArray(body.includedRegionCodes)
      ? body.includedRegionCodes.filter((value): value is string => typeof value === "string")
      : [];
  const places = ALL_PLACES.filter(place => regions.includes(countryCode(place).toLowerCase()));

  sendJson(response, HTTP_STATUS.OK, { suggestions: places.map(toPrediction) });
};

const routeRequest = async (request: IncomingMessage, response: ServerResponse) => {
  const isAutocomplete = request.url?.startsWith(FAKE_PLACES_ROUTES.AUTOCOMPLETE) ?? false;

  if (isAutocomplete) {
    await answerAutocomplete(request, response);

    return;
  }

  answerPlaceDetails(request, response);
};

export const startFakePlacesServer = (port: number): Promise<Server> =>
  new Promise(resolve => {
    const server = createServer(async (request, response) => {
      try {
        await routeRequest(request, response);
      } catch (error) {
        logger.error("Fake Places request failed", { error });
        sendJson(response, HTTP_STATUS.BAD_REQUEST, { error: { status: "INVALID_ARGUMENT" } });
      }
    });

    server.listen(port, () => resolve(server));
  });
