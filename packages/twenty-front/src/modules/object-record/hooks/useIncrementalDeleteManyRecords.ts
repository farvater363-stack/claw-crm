import { useConfirmOrderMoneyBeforeCancel } from '@/claw-order-money/hooks/useConfirmOrderMoneyBeforeCancel';
import { buildOrderCancelInput } from '@/claw-order-money/utils/orderMoney';
import { useRefetchFindManyRecords } from '@/object-record/hooks/useRefetchFindManyRecords';
import { useUpdateManyRecords } from '@/object-record/hooks/useUpdateManyRecords';
import { triggerUpdateRecordOptimisticEffectByBatch } from '@/apollo/optimistic-effect/utils/triggerUpdateRecordOptimisticEffectByBatch';
import { dispatchObjectRecordOperationBrowserEvent } from '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent';
import { useRemoveNavigationMenuItemByTargetRecordId } from '@/navigation-menu-item/common/hooks/useRemoveNavigationMenuItemByTargetRecordId';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useGetRecordFromCache } from '@/object-record/cache/hooks/useGetRecordFromCache';
import { getObjectTypename } from '@/object-record/cache/utils/getObjectTypename';
import { getRecordNodeFromRecord } from '@/object-record/cache/utils/getRecordNodeFromRecord';
import { updateRecordFromCache } from '@/object-record/cache/utils/updateRecordFromCache';
import { DEFAULT_QUERY_PAGE_SIZE } from '@/object-record/constants/DefaultQueryPageSize';
import { type RecordGqlNode } from '@/object-record/graphql/types/RecordGqlNode';
import { useDeleteManyRecordsMutation } from '@/object-record/hooks/useDeleteManyRecordsMutation';
import { type UseFindManyRecordsParams } from '@/object-record/hooks/useFetchMoreRecordsWithPagination';
import { useIncrementalFetchAndMutateRecords } from '@/object-record/hooks/useIncrementalFetchAndMutateRecords';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useRefetchAggregateQueries } from '@/object-record/hooks/useRefetchAggregateQueries';
import { useUpsertRecordsInStore } from '@/object-record/record-store/hooks/useUpsertRecordsInStore';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useCallback } from 'react';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { sleep } from '~/utils/sleep';

const DEFAULT_DELAY_BETWEEN_MUTATIONS_MS = 50;

type UseIncrementalDeleteManyRecordsParams<T> = Omit<
  UseFindManyRecordsParams<T>,
  'skip'
> & {
  objectNameSingular: string;
  pageSize?: number;
  delayInMsBetweenMutations?: number;
  skipOptimisticEffect?: boolean;
};

export const useIncrementalDeleteManyRecords = <T>({
  objectNameSingular,
  filter,
  orderBy,
  pageSize = DEFAULT_QUERY_PAGE_SIZE,
  delayInMsBetweenMutations = DEFAULT_DELAY_BETWEEN_MUTATIONS_MS,
  skipOptimisticEffect = false,
}: UseIncrementalDeleteManyRecordsParams<T>) => {
  const { upsertRecordsInStore } = useUpsertRecordsInStore();

  const mutationPageSize = pageSize;

  const apolloCoreClient = useApolloCoreClient();

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const getRecordFromCache = useGetRecordFromCache({
    objectNameSingular,
  });

  const { deleteManyRecordsMutation } = useDeleteManyRecordsMutation({
    objectNameSingular,
  });

  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();
  const { refetchAggregateQueries } = useRefetchAggregateQueries();
  const { refetchFindManyRecords } = useRefetchFindManyRecords({
    objectMetadataNamePlural: objectMetadataItem.namePlural,
  });
  const { updateManyRecords } = useUpdateManyRecords({ objectNameSingular });
  const { confirmOrderMoneyBeforeCancel } = useConfirmOrderMoneyBeforeCancel();
  const { removeNavigationMenuItemsByTargetRecordIds } =
    useRemoveNavigationMenuItemByTargetRecordId();

  const { incrementalFetchAndMutate, progress, isProcessing, updateProgress } =
    useIncrementalFetchAndMutateRecords<T>({
      objectNameSingular,
      filter,
      orderBy,
      limit: pageSize,
      recordGqlFields: { id: true },
    });

  const buildOptimisticRecordNodes = useCallback(
    (cachedRecords: ObjectRecord[], timestamp: string) => {
      const cachedRecordsNode: RecordGqlNode[] = [];
      const computedOptimisticRecordsNode: RecordGqlNode[] = [];

      const recordGqlFields = {
        deletedAt: true,
      };

      cachedRecords.forEach((cachedRecord) => {
        const cachedRecordNode = getRecordNodeFromRecord<ObjectRecord>({
          record: cachedRecord,
          objectMetadataItem,
          objectMetadataItems,
          computeReferences: false,
        });

        const computedOptimisticRecord = {
          ...cachedRecord,
          deletedAt: timestamp,
          __typename: getObjectTypename(objectMetadataItem.nameSingular),
        };

        const optimisticRecordNode = getRecordNodeFromRecord<ObjectRecord>({
          record: computedOptimisticRecord,
          objectMetadataItem,
          objectMetadataItems,
          computeReferences: false,
        });

        if (isDefined(optimisticRecordNode) && isDefined(cachedRecordNode)) {
          updateRecordFromCache({
            objectMetadataItems,
            objectMetadataItem,
            cache: apolloCoreClient.cache,
            record: computedOptimisticRecord,
            recordGqlFields,
            objectPermissionsByObjectMetadataId,
          });

          computedOptimisticRecordsNode.push(optimisticRecordNode);
          cachedRecordsNode.push(cachedRecordNode);
        }
      });

      return { cachedRecordsNode, computedOptimisticRecordsNode };
    },
    [
      apolloCoreClient.cache,
      objectMetadataItem,
      objectMetadataItems,
      objectPermissionsByObjectMetadataId,
    ],
  );

  const deleteManyRecordsBatch = async (
    recordIdsToDelete: string[],
    abortSignal: AbortSignal,
  ) => {
    const numberOfBatches = Math.ceil(
      recordIdsToDelete.length / mutationPageSize,
    );

    for (let batchIndex = 0; batchIndex < numberOfBatches; batchIndex++) {
      const batchedIdsToDelete = recordIdsToDelete.slice(
        batchIndex * mutationPageSize,
        (batchIndex + 1) * mutationPageSize,
      );

      const cachedRecords = batchedIdsToDelete
        .map((idToDelete) =>
          getRecordFromCache(idToDelete, apolloCoreClient.cache),
        )
        .filter(isDefined);

      if (!skipOptimisticEffect) {
        const currentTimestamp = new Date().toISOString();
        const { cachedRecordsNode, computedOptimisticRecordsNode } =
          buildOptimisticRecordNodes(cachedRecords, currentTimestamp);

        triggerUpdateRecordOptimisticEffectByBatch({
          cache: apolloCoreClient.cache,
          objectMetadataItem,
          currentRecords: cachedRecordsNode,
          updatedRecords: computedOptimisticRecordsNode,
          objectMetadataItems,
          objectPermissionsByObjectMetadataId,
          upsertRecordsInStore,
        });
      }

      await apolloCoreClient
        .mutate<Record<string, ObjectRecord[]>>({
          mutation: deleteManyRecordsMutation,
          variables: {
            filter: { id: { in: batchedIdsToDelete } },
          },
          context: {
            fetchOptions: {
              signal: abortSignal,
            },
          },
        })
        .catch((error: Error) => {
          if (skipOptimisticEffect) {
            throw error;
          }

          const recordGqlFields = {
            deletedAt: true,
          };

          cachedRecords.forEach((cachedRecord) => {
            updateRecordFromCache({
              objectMetadataItems,
              objectMetadataItem,
              cache: apolloCoreClient.cache,
              record: { ...cachedRecord, deletedAt: null },
              recordGqlFields,
              objectPermissionsByObjectMetadataId,
            });
          });

          const currentTimestamp = new Date().toISOString();
          const { cachedRecordsNode, computedOptimisticRecordsNode } =
            buildOptimisticRecordNodes(cachedRecords, currentTimestamp);

          triggerUpdateRecordOptimisticEffectByBatch({
            cache: apolloCoreClient.cache,
            objectMetadataItem,
            currentRecords: computedOptimisticRecordsNode,
            updatedRecords: cachedRecordsNode,
            objectMetadataItems,
            objectPermissionsByObjectMetadataId,
            upsertRecordsInStore,
          });

          throw error;
        });

      if (delayInMsBetweenMutations > 0) {
        await sleep(delayInMsBetweenMutations);
      }
    }
  };

  const incrementalDeleteManyRecords = async () => {
    let hasKeptRecords = false;
    let totalDeletedCount = 0;
    const allDeletedRecordIds: string[] = [];

    let deletionError: unknown;

    try {
      await incrementalFetchAndMutate(
        async ({ recordIds, totalCount, abortSignal }) => {
          // An order the client paid for is cancelled, never deleted.
          const { proceed, paidRecordIds, paidMoneyOnCancel } =
            await confirmOrderMoneyBeforeCancel({
              objectNameSingular,
              recordIds,
              action: 'delete',
            });

          if (!proceed) {
            hasKeptRecords = true;
            return;
          }

          const recordIdsToDelete = recordIds.filter(
            (recordId) => !paidRecordIds.includes(recordId),
          );

          if (isNonEmptyArray(paidRecordIds) && isDefined(paidMoneyOnCancel)) {
            hasKeptRecords = true;

            await updateManyRecords({
              recordIdsToUpdate: paidRecordIds,
              updateOneRecordInput: buildOrderCancelInput(
                {},
                paidMoneyOnCancel,
              ),
              abortSignal,
            });
          }

          if (isNonEmptyArray(recordIdsToDelete)) {
            await deleteManyRecordsBatch(recordIdsToDelete, abortSignal);
          }

          allDeletedRecordIds.push(...recordIdsToDelete);
          totalDeletedCount += recordIdsToDelete.length;

          updateProgress(totalDeletedCount, totalCount);
        },
      );
    } catch (error) {
      deletionError = error;
    }

    if (isNonEmptyArray(allDeletedRecordIds)) {
      removeNavigationMenuItemsByTargetRecordIds(allDeletedRecordIds);

      dispatchObjectRecordOperationBrowserEvent({
        objectMetadataItem,
        operation: {
          type: 'delete-many',
          deletedRecordIds: allDeletedRecordIds,
        },
      });
    }

    // The views already dropped the selection; bring back what stayed.
    if (hasKeptRecords) {
      await refetchFindManyRecords();
    }

    await refetchAggregateQueries({
      objectMetadataNamePlural: objectMetadataItem.namePlural,
    }).catch((refetchError: unknown) => {
      if (!isDefined(deletionError)) {
        throw refetchError;
      }
    });

    if (isDefined(deletionError)) {
      throw deletionError;
    }

    return totalDeletedCount;
  };

  return { incrementalDeleteManyRecords, progress, isProcessing };
};
