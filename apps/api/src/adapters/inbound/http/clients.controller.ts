import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { ClientResponse } from '@signal-monitoring/shared';
import { z } from 'zod';
import {
  AddBrandUseCase,
  ListClientsUseCase,
  RemoveBrandUseCase,
  UpdateBrandAccountsUseCase,
} from '../../../core/application';
import { ClientNotFoundError, DuplicateBrandError, InvalidBrandError } from '../../../core/domain';
import { toClientResponse } from './response.mappers';

const addBrandBody = z.object({
  name: z.string(),
  linkedInUrl: z.string(),
  website: z.string().nullable().optional(),
  instagram: z.string().nullable().optional(),
  tiktok: z.string().nullable().optional(),
  youtube: z.string().nullable().optional(),
});

const updateAccountsBody = z
  .object({
    website: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    tiktok: z.string().nullable().optional(),
    youtube: z.string().nullable().optional(),
  })
  .strict();

@Controller('clients')
export class ClientsController {
  constructor(
    @Inject(ListClientsUseCase) private readonly listClients: ListClientsUseCase,
    @Inject(AddBrandUseCase) private readonly addBrand: AddBrandUseCase,
    @Inject(RemoveBrandUseCase) private readonly removeBrand: RemoveBrandUseCase,
    @Inject(UpdateBrandAccountsUseCase)
    private readonly updateAccounts: UpdateBrandAccountsUseCase,
  ) {}

  /**
   * Add, change or remove a brand's website, Instagram, TikTok or YouTube.
   * Omitted fields are kept; an empty value removes that account.
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<ClientResponse> {
    const parsed = updateAccountsBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'Send any of website, instagram, tiktok and youtube as text (empty to remove).',
      );
    }
    try {
      await this.updateAccounts.execute(id, parsed.data);
    } catch (error) {
      if (error instanceof InvalidBrandError) throw new BadRequestException(error.message);
      if (error instanceof ClientNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
    const updated = (await this.listClients.execute()).find((view) => view.client.id === id);
    if (updated === undefined) throw new NotFoundException(`Client not found: ${id}`);
    return toClientResponse(updated);
  }

  /** Monitored brands with their handles and last-checked times. */
  @Get()
  async list(): Promise<ClientResponse[]> {
    return (await this.listClients.execute()).map(toClientResponse);
  }

  /** Phase 1 manual brand setup: name plus LinkedIn company page; website, Instagram, TikTok and YouTube optional. */
  @Post()
  async add(@Body() body: unknown): Promise<ClientResponse> {
    const parsed = addBrandBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'Send name, linkedInUrl and optionally website, instagram, tiktok and youtube as text.',
      );
    }
    let id: string;
    try {
      id = (await this.addBrand.execute(parsed.data)).id;
    } catch (error) {
      if (error instanceof InvalidBrandError) throw new BadRequestException(error.message);
      if (error instanceof DuplicateBrandError) throw new ConflictException(error.message);
      throw error;
    }
    const added = (await this.listClients.execute()).find((view) => view.client.id === id);
    if (added === undefined) throw new NotFoundException(`Client not found: ${id}`);
    return toClientResponse(added);
  }

  /** Stop monitoring a brand. Signals already collected are kept. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    try {
      await this.removeBrand.execute(id);
    } catch (error) {
      if (error instanceof ClientNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
