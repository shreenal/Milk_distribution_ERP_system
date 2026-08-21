import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  shop_name?: string;


  @IsInt()
  delivery_group_id!: number;

  @IsInt()
  owner_distributor_id!: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
