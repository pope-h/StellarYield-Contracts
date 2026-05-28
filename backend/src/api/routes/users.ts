import { Router } from "express";
import { z } from "zod";
import { getUser, getUserPortfolio } from "../controllers/users.js";
import {
  validateParams,
  stellarAddressSchema,
} from "../middleware/validate.js";

export const usersRouter = Router();

const addressParamSchema = z.object({
  address: stellarAddressSchema,
});

usersRouter.get("/:address", validateParams(addressParamSchema), getUser);
usersRouter.get(
  "/:address/portfolio",
  validateParams(addressParamSchema),
  getUserPortfolio,
);
