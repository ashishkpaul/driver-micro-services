import { IsEnum } from "class-validator";

export class UpdateDriverStatusDto {
  @IsEnum(["AVAILABLE", "BUSY", "OFFLINE"])
  status: "AVAILABLE" | "BUSY" | "OFFLINE";
}
