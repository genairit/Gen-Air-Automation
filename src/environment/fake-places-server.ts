import { HTTP_STATUS } from "../constants/http.constant.ts";
import type { IFakePlace } from "../interfaces/fake-place.interface.ts";
import { FAKE_PLACES, FAKE_PLACES_ROUTES } from "../constants/fake-places.constant.ts";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

const JSON_HEADERS = { "Content-Type": "application/json" };

const COUNTRY = { NAME: "ישראל", CODE: "IL" } as const;

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
  addressComponents: [
    { types: ["locality"], longText: place.city, shortText: place.city },
    { types: ["country"], longText: COUNTRY.NAME, shortText: COUNTRY.CODE },
  ],
});

const sendJson = (response: ServerResponse, status: number, body: object) => {
  response.writeHead(status, JSON_HEADERS);
  response.end(JSON.stringify(body));
};

const findPlace = (url: string) => {
  const [path] = url.split("?");
  const placeId = decodeURIComponent(path.slice(FAKE_PLACES_ROUTES.PLACE_PREFIX.length));

  return FAKE_PLACES.find(place => place.placeId === placeId) ?? null;
};

const answerPlaceDetails = (request: IncomingMessage, response: ServerResponse) => {
  const place = findPlace(request.url ?? "");

  if (!place) {
    sendJson(response, HTTP_STATUS.NOT_FOUND, { error: { status: "NOT_FOUND" } });

    return;
  }

  sendJson(response, HTTP_STATUS.OK, toPlaceDetails(place));
};

const answerAutocomplete = (response: ServerResponse) =>
  sendJson(response, HTTP_STATUS.OK, { suggestions: FAKE_PLACES.map(toPrediction) });

const routeRequest = (request: IncomingMessage, response: ServerResponse) => {
  const isAutocomplete = request.url?.startsWith(FAKE_PLACES_ROUTES.AUTOCOMPLETE) ?? false;

  request.resume();

  if (isAutocomplete) {
    answerAutocomplete(response);

    return;
  }

  answerPlaceDetails(request, response);
};

export const startFakePlacesServer = (port: number): Promise<Server> =>
  new Promise(resolve => {
    const server = createServer(routeRequest);

    server.listen(port, () => resolve(server));
  });
