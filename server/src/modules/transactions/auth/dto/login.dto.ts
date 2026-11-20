import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Username used to sign in',
    example: 'admin',
  })
  @IsString()
  username!: string;

  @ApiProperty({
    description: 'User password',
    minLength: 1,
    maxLength: 128,
    example: 'your-password',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
