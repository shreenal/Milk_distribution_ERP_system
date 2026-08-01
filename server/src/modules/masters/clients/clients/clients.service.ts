import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CLIENT_CODE_PREFIX,CLIENT_CODE_LENGTH } from './clients.constants.js';

import { DistributorRepository } from '../../distribution/distributors/distributor.repository.js';
import { GroupsRepository } from '../groups/groups.repository.js';

import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { ClientsRepository } from './clients.repository.js';

@Injectable()
export class ClientsService {
  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly groupsRepository: GroupsRepository,
    private readonly distributorRepository: DistributorRepository,
  ) {}

  findAll() {
    return this.clientsRepository.findAll();
  }

  findActive() {
    return this.clientsRepository.findActive();
  }

  async findById(id: number) {
    const client = await this.clientsRepository.findById(id);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  async create(dto: CreateClientDto) {
    const billingGroup = await this.groupsRepository.findById(
      dto.billing_group_id,
    );

    if (!billingGroup) {
      throw new NotFoundException('Billing group not found');
    }

    const deliveryGroup = await this.groupsRepository.findById(
      dto.delivery_group_id,
    );

    if (!deliveryGroup) {
      throw new NotFoundException('Delivery group not found');
    }

    const distributor = await this.distributorRepository.findById(
      dto.owner_distributor_id,
    );

    if (!distributor) {
      throw new NotFoundException('Distributor not found');
    }

    const client = await this.clientsRepository.create({
      ...dto,
      code: null,
    });

    const code = `${CLIENT_CODE_PREFIX}${client.id
      .toString()
      .padStart(CLIENT_CODE_LENGTH, '0')}`;

    return this.clientsRepository.updateCode(client.id, code);
  }

  async update(id: number, dto: UpdateClientDto) {
    await this.findById(id);

    if (dto.billing_group_id !== undefined) {
      const billingGroup = await this.groupsRepository.findById(
        dto.billing_group_id,
      );

      if (!billingGroup) {
        throw new NotFoundException('Billing group not found');
      }
    }

    if (dto.delivery_group_id !== undefined) {
      const deliveryGroup = await this.groupsRepository.findById(
        dto.delivery_group_id,
      );

      if (!deliveryGroup) {
        throw new NotFoundException('Delivery group not found');
      }
    }

    if (dto.owner_distributor_id !== undefined) {
      const distributor = await this.distributorRepository.findById(
        dto.owner_distributor_id,
      );

      if (!distributor) {
        throw new NotFoundException('Distributor not found');
      }
    }

    return this.clientsRepository.update(id, dto);
  }

  async delete(id: number) {
    await this.findById(id);

    return this.clientsRepository.delete(id);
  }
}