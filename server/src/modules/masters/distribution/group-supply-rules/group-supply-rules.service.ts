import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DistributorRepository } from '../distributors/distributor.repository.js';
import { GroupsRepository } from '../../clients/groups/groups.repository.js';

import { CreateGroupSupplyRuleDto } from './dto/create-group-supply-rules.dto.js';
import { UpdateGroupSupplyRuleDto } from './dto/update-group-supply-rules.dto.js';
import { GroupSupplyRulesRepository } from './group-supply-rules.repository.js';

@Injectable()
export class GroupSupplyRulesService {
  constructor(
    private readonly groupSupplyRulesRepository: GroupSupplyRulesRepository,
    private readonly groupsRepository: GroupsRepository,
    private readonly distributorRepository: DistributorRepository,
  ) {}

  findAll() {
    return this.groupSupplyRulesRepository.findAll();
  }

  findActive() {
    return this.groupSupplyRulesRepository.findActive();
  }

  async findById(id: number) {
    const groupSupplyRule = await this.groupSupplyRulesRepository.findById(id);

    if (!groupSupplyRule) {
      throw new NotFoundException('Group supply rule not found.');
    }

    return groupSupplyRule;
  }

  async create(dto: CreateGroupSupplyRuleDto) {
    await this.validateReferences(dto);

    const duplicate = await this.groupSupplyRulesRepository.findDuplicate(
      dto.group_id,
      dto.category,
    );

    if (duplicate) {
      throw new ConflictException('Group supply rule already exists.');
    }

    return this.groupSupplyRulesRepository.create(dto);
  }

  async update(id: number, dto: UpdateGroupSupplyRuleDto) {
    const existing = await this.findById(id);

    const data = {
      group_id: dto.group_id ?? existing.group_id,
      category: dto.category ?? existing.category,
      distributor_id: dto.distributor_id ?? existing.distributor_id,
    };

    await this.validateReferences(data);

    const duplicate = await this.groupSupplyRulesRepository.findDuplicate(
      data.group_id,
      data.category,
    );

    if (duplicate && duplicate.id !== id) {
      throw new ConflictException('Group supply rule already exists.');
    }

    return this.groupSupplyRulesRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.groupSupplyRulesRepository.delete(id);
  }

  private async validateReferences(data: {
    group_id: number;
    distributor_id: number;
  }) {
    const group = await this.groupsRepository.findById(data.group_id);

    if (!group) {
      throw new NotFoundException('Group not found.');
    }

    const distributor = await this.distributorRepository.findById(
      data.distributor_id,
    );

    if (!distributor) {
      throw new NotFoundException('Distributor not found.');
    }
  }
}
