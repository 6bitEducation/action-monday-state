import * as core from '@actions/core'
import { action } from './monday'

const mondayToken = core.getInput('monday-token')
const boardId = core.getInput('board-id')

const text = core.getInput('text')
const prefix = core.getInput('prefix')
const postfix = core.getInput('postfix')

const statusColumnId = core.getInput('status-column-id')
const statusColumnTitle = core.getInput('status-column-title')
const columnValue = core.getInput('column-value')

const searchColumnId = core.getInput('search-column-id')
const searchColumnTitle = core.getInput('search-column-title')

const status = core.getInput('set-status')

const mondayOrganization = core.getInput('monday-organization')
const statusBefore = core.getInput('require-status')
const multiple = core.getBooleanInput('multiple')
const doNotFail = core.getBooleanInput('allow-no-item-id')

try {
  const { itemIds, message } = await action({
    mondayToken,
    boardId,
    text,
    statusColumnTitle,
    statusColumnId,
    prefix,
    postfix,
    statusBefore,
    status,
    multiple,
    mondayOrganization,
    doNotFail,
    columnValue,
    searchColumnId,
    searchColumnTitle,
  })
  core.info(`Successfully updated status of item with ID ${JSON.stringify(itemIds)}`)
  core.setOutput('item-ids', JSON.stringify(itemIds))
  core.setOutput('message', message)
}
catch (err) {
  core.error(err)
  core.setFailed(err.message)
}
