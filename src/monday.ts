import mondaySdk from 'monday-sdk-js'

import assert from 'assert'
import * as core from '@actions/core'

const monday = mondaySdk()
function initializeSdk(token: string) {
  assert.ok(!!token, 'Monday Token is required')
  monday.setToken(token)
  monday.setApiVersion('2024-04')
  return monday
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseItemId(
  text: string,
  {
    prefix,
    postfix,
    multiple,
  }: {
    prefix: string
    postfix: string
    multiple: boolean
  }) {
  const pre = prefix ? escapeRegExp(prefix) : '\\b'
  const post = postfix ? escapeRegExp(postfix) : '\\b'

  const regex = new RegExp(`(?<=${pre})\\d{10}(?=${post})`, multiple ? 'g' : '')

  const matches = text.match(regex)

  return [...new Set(matches)]
}

async function findItems({
  boardId,
  columnId,
  columnValue,
}: {
  boardId: string
  columnId: string
  columnValue: string
}) {
  type Result = {
    items_page_by_column_values: {
      cursor: string | null
      items: {
        id: string
      }[]
    }

  }
  const result = await monday.api<Result>(
    `query findItems($columnSearch : [ItemsPageByColumnValuesQuery!]) {
      items_page_by_column_values(
        board_id : ${boardId},
        columns : $columnSearch
      ) {
        cursor
        items {
          id
        }
      }
    }`,
    {
      variables: {
        columnSearch: [{
          column_id: columnId,
          column_values: columnValue,
        }],
      },
    },
  )

  return result.data.items_page_by_column_values.items
}

async function getItemStatus(itemId: string, columnId: string) {
  type Result = {
    items: {
      column_values: {
        text: string
      }[]
    }[]
  }
  const result = await monday.api<Result>(`query {
    items (ids: ${itemId}) {
      column_values (ids: "${columnId}") {
        text
      }
    }
  }`)
  const status = result.data.items[0]?.column_values[0]?.text
  return status
}

async function columnIdByTitle(boardId: string, columnTitle: string) {
  assert.ok(!!columnTitle, 'ColumnTitle must be provided')

  type Result = {
    boards: {
      columns: {
        id: string
        title: string
      }[]
    }[]
  }
  const result = await monday.api<Result>(`query {
    boards (ids: ${boardId}) {
      columns { title, id }
    }
  }`)

  const columns = result.data.boards[0]?.columns
  if (!columns) {
    throw new Error('board not found')
  }

  const column = columns.find(({ title }) => title === columnTitle)
  if (!column) {
    throw new Error(`No column found with title ${columnTitle}`)
  }

  return column.id
}

async function updateItemStatus(
  boardId: string,
  itemId: string,
  columnId: string,
  status: string,
) {
  type Result = {
    change_column_value: {
      column_values: {
        text: string
      }[]
    }
  }
  const result = await monday.api<Result>(
    `mutation change_column_value($value: JSON!) {
      change_column_value (
        board_id: ${boardId},
        item_id: ${itemId},
        column_id: "${columnId}",
        value: $value,
      ) {
        column_values (ids: "${columnId}") {
          text
        }
      }
    }`,
    {
      variables: {
        value: JSON.stringify({
          label: status,
        }),
      },
    },
  )

  const updatedStatus = result.data.change_column_value.column_values[0]?.text
  if (updatedStatus !== status) {
    throw new Error('Failed to set new status')
  }

  return updatedStatus
}

export async function action({
  mondayToken,
  boardId,

  text,
  prefix,
  postfix,

  searchColumnId,
  searchColumnTitle,
  columnValue,

  statusColumnId,
  statusColumnTitle,

  status,

  mondayOrganization,
  statusBefore,
  doNotFail,
  multiple,
}: {
  // required
  mondayToken: string
  boardId: string

  // either obtain an itemId from text
  prefix: string
  postfix: string
  text: string

  // or provide
  columnValue: string

  // and one of
  searchColumnTitle: string
  searchColumnId: string

  // For field to update

  // one of
  statusColumnTitle: string
  statusColumnId: string

  // required
  status: string

  // optional
  statusBefore: string
  mondayOrganization: string
  doNotFail: boolean
  multiple: boolean
}) {
  assert.ok(!!boardId, 'Board Id is required')

  assert.ok(Boolean(text || columnValue), 'Either text or columnValue should be provided')

  initializeSdk(mondayToken)
  core.debug('Initialized monday SDK')

  let itemIds: string[]
  if (text) {
    core.debug('Using itemId from text input')
    itemIds = parseItemId(text, { prefix, postfix, multiple })
  }
  else {
    core.debug('Finding items via column value')
    const items = await findItems({
      boardId,
      columnId: searchColumnId || await columnIdByTitle(boardId, searchColumnTitle),
      columnValue,
    })
    itemIds = items.map(({ id }) => id)
  }
  if (itemIds.length === 0) {
    return noItems(doNotFail)
  }
  core.debug(`found ids ${itemIds.join(', ')}`)

  const columnId = statusColumnId || await columnIdByTitle(boardId, statusColumnTitle)

  const mondayBannerUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Monday_logo.svg/320px-Monday_logo.svg.png'
  let message = `![monday.com](${mondayBannerUrl})\nThe status of the following items has been referenced on monday.com:\n`

  for (const itemId of itemIds) {
    if (await shouldSkip(itemId, columnId, statusBefore)) continue

    await updateItemStatus(boardId, itemId, columnId, status)

    const link = mondayOrganization ? `[↪](https://${mondayOrganization}.monday.com/boards/${boardId}/pulses/${itemId})` : ''
    message += `- [${status}] ${itemId} ${link} \n`
  }

  return {
    itemIds,
    message,
  }
}

async function shouldSkip(itemId: string, columnId: string, statusBefore: string) {
  if (!statusBefore) return false

  const currentStatus = await getItemStatus(itemId, columnId)

  return currentStatus !== statusBefore
}

function noItems(doNotFail: boolean) {
  core.debug(`No itemIds found`)
  if (!doNotFail) {
    throw new Error('No itemIds found in text')
  }
  return {
    message: 'No itemIds found in text',
    itemIds: [],
  }
}
