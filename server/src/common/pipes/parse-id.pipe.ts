import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const n = Number(value);
    if (!/^\d+$/.test(value) || n < 1 || n > 2147483647)
      throw new BadRequestException('Invalid id');
    return n;
  }
}
