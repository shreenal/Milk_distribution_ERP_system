import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DistributorRepository } from '../distributors/distributor.repository.js';

import { CreateTransferRuleDto } from './dto/create-transfer-rule.dto.js';
import { UpdateTransferRuleDto } from './dto/update-transfer-rule.dto.js';
import { TransferRulesRepository } from './transfer-rules.repository.js';

@Injectable()
export class TransferRulesService {
  constructor(
    private readonly transferRulesRepository: TransferRulesRepository,
    private readonly distributorRepository: DistributorRepository,
  ) {}

  findAll() {
    return this.transferRulesRepository.findAll();
  }

  findActive() {
    return this.transferRulesRepository.findActive();
  }

  async findById(id: number) {
    const transferRule = await this.transferRulesRepository.findById(id);

    if (!transferRule) {
      throw new NotFoundException('Transfer rule not found.');
    }

    return transferRule;
  }

  async create(dto: CreateTransferRuleDto) {
    await this.validateReferences(dto);

    if (dto.supplier_distributor_id === dto.owner_distributor_id) {
      throw new ConflictException(
        'Supplier distributor and owner distributor cannot be the same.',
      );
    }

    const duplicate = await this.transferRulesRepository.findDuplicate(
      dto.supplier_distributor_id,
      dto.owner_distributor_id,
    );

    if (duplicate) {
      throw new ConflictException('Transfer rule already exists.');
    }

    return this.transferRulesRepository.create(dto);
  }

  async update(id: number, dto: UpdateTransferRuleDto) {
    const existing = await this.findById(id);

    const data = {
      supplier_distributor_id:
        dto.supplier_distributor_id ?? existing.supplier_distributor_id,
      owner_distributor_id:
        dto.owner_distributor_id ?? existing.owner_distributor_id,
    };

    await this.validateReferences(data);

    if (data.supplier_distributor_id === data.owner_distributor_id) {
      throw new ConflictException(
        'Supplier distributor and owner distributor cannot be the same.',
      );
    }

    const duplicate = await this.transferRulesRepository.findDuplicate(
      data.supplier_distributor_id,
      data.owner_distributor_id,
    );

    if (duplicate && duplicate.id !== id) {
      throw new ConflictException('Transfer rule already exists.');
    }

    return this.transferRulesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.transferRulesRepository.delete(id);
  }

  private async validateReferences(data: {
    supplier_distributor_id: number;
    owner_distributor_id: number;
  }) {
    const supplier = await this.distributorRepository.findById(
      data.supplier_distributor_id,
    );

    if (!supplier) {
      throw new NotFoundException('Supplier distributor not found.');
    }

    const owner = await this.distributorRepository.findById(
      data.owner_distributor_id,
    );

    if (!owner) {
      throw new NotFoundException('Owner distributor not found.');
    }
  }
}
