import { ApiProperty } from "@nestjs/swagger";

export class ApiResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({ type: "object", nullable: true, additionalProperties: true })
  data!: unknown;

  @ApiProperty({ required: false })
  message?: string;
}
