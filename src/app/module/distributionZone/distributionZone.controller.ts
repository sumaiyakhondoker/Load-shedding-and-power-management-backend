import type { RequestHandler } from "express";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DistributionZoneService } from "./distributionZone.service";
import { listDistributionZonesSchema, type CreateDistributionZoneInput } from "./distributionZone.validation";

const list = catchAsync(async (req, res) => {
  const query = listDistributionZonesSchema.parse(req.query);
  const result = await DistributionZoneService.list(query);
  let resMessage;
  if(result.zones.length > 0){
    // console.log('length: ',result.zones.length);
   resMessage = "Distribution zones retrieved"
  }else{
 resMessage = "No distribution zone found according to your searching."
  }
  sendResponse({ res, statusCode: 200, message: resMessage, data: result });
});

const create = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new AppError(401, "Authentication required");
  }

  const zone = await DistributionZoneService.create(
    req.user.id,
    req.body as CreateDistributionZoneInput
  );
  sendResponse({ res, statusCode: 201, message: "Distribution zone created", data: zone });
});

export const DistributionZoneController: { list: RequestHandler; create: RequestHandler } = {
  list,
  create,
};
