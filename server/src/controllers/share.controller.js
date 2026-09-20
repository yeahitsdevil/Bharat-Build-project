import crypto from "node:crypto";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo } from "../config/dynamo.js";
import { env } from "../config/env.js";
import { getPlaceById } from "../services/places.service.js";

const ALLOWED_PLACE_FIELDS = [
  "id",
  "providerPlaceId",
  "name",
  "category",
  "tags",
  "rating",
  "lat",
  "lng",
  "distanceKm",
  "address",
  "description",
  "isHiddenGem",
  "estimatedCost",
  "bestTime",
  "openNow",
  "website",
  "phone",
  "source",
];

function sanitizePlace(input) {
  if (!input || typeof input !== "object") return null;
  const place = Object.fromEntries(
    ALLOWED_PLACE_FIELDS.filter((key) => input[key] !== undefined).map(
      (key) => [key, input[key]],
    ),
  );
  if (!place.name || place.lat == null || place.lng == null) return null;
  if (
    !Number.isFinite(Number(place.lat)) ||
    !Number.isFinite(Number(place.lng))
  )
    return null;
  if (
    Number(place.lat) < -90 ||
    Number(place.lat) > 90 ||
    Number(place.lng) < -180 ||
    Number(place.lng) > 180
  )
    return null;
  place.name = String(place.name).slice(0, 200);
  return place;
}

export async function createShare(req, res, next) {
  try {
    const inputPlace = sanitizePlace(req.body?.place);

    if (!inputPlace) {
      return res.status(400).json({
        message: "A valid place is required.",
      });
    }

    // A share persists provider-derived place data, so refresh it with Amazon Location's
    // Storage intended use before writing it to DynamoDB. This keeps discovery requests SingleUse.
    const providerPlace = inputPlace.providerPlaceId
      ? await getPlaceById(inputPlace.providerPlaceId, { intendedUse: 'Storage' })
      : null;
    const place = inputPlace.providerPlaceId ? sanitizePlace(providerPlace) : inputPlace;

    if (!place) {
      return res.status(502).json({ message: 'The place could not be refreshed for sharing.' });
    }

    const slug = crypto.randomBytes(8).toString("hex");

    const now = Date.now();

    const expiresAt = now + env.shareTtlDays * 24 * 60 * 60 * 1000;

    await dynamo.send(
      new PutCommand({
        TableName: env.dynamoTableName,

        Item: {
          shareId: slug,
          place,
          createdAt: now,
          expiresAt: Math.floor(expiresAt / 1000),
        },

        ConditionExpression: "attribute_not_exists(shareId)",
      }),
    );

    res.status(201).json({
      slug,
      expiresAt,
    });
  } catch (error) {
    console.error("[share] Failed to create share:", error);

    if (
      error?.name === "AccessDeniedException" ||
      error?.Code === "AccessDeniedException"
    ) {
      return res.status(503).json({
        message:
          "Sharing is not configured: the AWS user needs DynamoDB PutItem permission on roamly-shared-places.",
      });
    }

    next(error);
  }
}

export async function getShare(req, res, next) {
  try {
    const slug = String(req.params.slug || "");
    if (!/^[a-f0-9]{16}$/.test(slug))
      return res.status(400).json({ message: "Invalid share link." });
    const response = await dynamo.send(
      new GetCommand({
        TableName: env.dynamoTableName,
        Key: { shareId: slug },
      }),
    );
    if (
      !response.Item ||
      Number(response.Item.expiresAt) <= Math.floor(Date.now() / 1000)
    )
      return res
        .status(404)
        .json({ message: "Shared place not found or expired." });
    res.json({
      place: response.Item.place,
      createdAt: response.Item.createdAt,
      expiresAt: response.Item.expiresAt * 1000,
    });
  } catch (error) {
    next(error);
  }
}
