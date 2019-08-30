import _ from 'lodash'
import {
  getSingleTimelineByReference,
  getTimelineById,
  createMilestone as createMilestoneApi,
  updateMilestone as updateMilestoneApi,
  deleteMilestone as deleteMilestoneApi,
  getMilestone,
} from '../../api/timelines'
import {
  LOAD_WORK_TIMELINE,
  NEW_WORK_TIMELINE_MILESTONE,
  UPDATE_WORK_TIMELINE_MILESTONE,
  DELETE_WORK_TIMELINE_MILESTONE,
  LOAD_WORK_TIMELINE_MILESTONE,
  COMPLETE_WORK_TIMELINE_MILESTONE,
  MILESTONE_STATUS,
} from '../../config/constants'
import { getNextNotHiddenMilestone } from '../../helpers/milestoneHelper'
import { buildMilestoneToCreate } from '../../helpers/workstreams'


/**
 * Load work timeline
 *
 * @param {String} workId work id
 *
 * @return {Function} action creator
 */
export function loadWorkTimeline(workId) {
  return (dispatch, getState) => {
    const state = getState()
    const timeline = _.get(state.workTimelines.timelines[workId], 'timeline')

    return dispatch({
      type: LOAD_WORK_TIMELINE,
      payload: (timeline ?
        // prefer loading timeline by id because such method would load timeline from DB
        getTimelineById(timeline.id) :
        // otherwise loading timeline by reference using ES index
        // Warning: when we perform some actions and after reload timeline immediately,
        // it could be not yet reflected in ES
        getSingleTimelineByReference('work', workId)
      )
        .then(timeline => {
          if (!timeline.milestones) {
            timeline.milestones = []
          }

          return {
            timeline,
          }
        }),
      meta: { workId },
    })
  }
}

/**
 * Create a new milestone for work timeline
 *
 * @param {Number} workId     work id
 * @param {Number} timelineId timeline id
 * @param {Object} milestone  milestone
 *
 * @return {Function} action creator
 */
export function createWorkMilestone(workId, timelineId, milestone) {
  return (dispatch) => {
    return dispatch({
      type: NEW_WORK_TIMELINE_MILESTONE,
      payload: createMilestoneApi(timelineId, milestone).then(newMilestone => ({ milestone: newMilestone })),
      meta: {
        workId,
        timelineId,
      }
    }).then(() => {
      // reload timeline after creating a milestone,
      // because backend could make cascading updates to the timeline and other milestones
      dispatch(loadWorkTimeline(workId))
    })
  }
}

/**
 * Update milestone for work timeline
 *
 * @param {Number} workId          work id
 * @param {Number} timelineId      timeline id
 * @param {Object} milestoneUpdate milestone data to update
 * @param {Array} progressIds   array of progress id
 *
 * @return {Function} dispatch function
 */
export function updateWorkMilestone(workId, timelineId, milestoneId, milestoneUpdate, progressIds) {
  return (dispatch) => {
    return dispatch({
      type: UPDATE_WORK_TIMELINE_MILESTONE,
      payload: updateMilestoneApi(timelineId, milestoneId, milestoneUpdate).then(updatedMilestone => ({ milestone: updatedMilestone })),
      meta: {
        workId,
        timelineId,
        milestoneId,
        progressIds
      }
    }).then(() => {
      // reload timeline after creating a milestone,
      // because backend could make cascading updates to the timeline and other milestones
      dispatch(loadWorkTimeline(workId))
    })
  }
}

/**
 * Load milestone for work timeline
 *
 * @param {Number} workId      work id
 * @param {Number} timelineId  timeline id
 * @param {Number} milestoneId milestone id
 *
 * @return {Function} dispatch function
 */
export function loadWorkMilestone(workId, timelineId, milestoneId) {
  return (dispatch) => {
    return dispatch({
      type: LOAD_WORK_TIMELINE_MILESTONE,
      payload: getMilestone(timelineId, milestoneId).then(milestone => ({ milestone })),
      meta: {
        workId,
        timelineId,
        milestoneId,
      }
    })
  }
}

/**
 * Delete milestone for work timeline
 *
 * @param {Number} workId       work id
 * @param {Number} timelineId   timeline id
 * @param {Number} milestoneId  milestone id
 *
 * @return {Function} dispatch function
 */
export function deleteWorkMilestone(workId, timelineId, milestoneId) {
  return (dispatch) => {
    return dispatch({
      type: DELETE_WORK_TIMELINE_MILESTONE,
      payload: deleteMilestoneApi(timelineId, milestoneId),
      meta: {
        workId,
        timelineId,
        milestoneId,
      }
    }).then(() => {
      // reload timeline after creating a milestone,
      // because backend could make cascading updates to the timeline and other milestones
      dispatch(loadWorkTimeline(workId))
    })
  }
}

/**
 * Mark work milestone as completed
 *
 * @param {Number} workId         work id
 * @param {Number} timelineId     timeline id
 * @param {Number} milestoneId    milestone id
 * @param {Object} [updatedProps] milestone properties to update
 *
 * @return {Function} dispatch function
 */
export function completeWorkMilestone(workId, timelineId, milestoneId, updatedProps) {
  return (dispatch, getState) => {
    const state = getState()
    let nextMilestone
    const timeline = _.get(state.workTimelines.timelines[workId], 'timeline')
    if (timeline) {
      const milestoneIdx = _.findIndex(timeline.milestones, { id: milestoneId })
      nextMilestone = getNextNotHiddenMilestone(timeline.milestones, milestoneIdx)
    }

    return dispatch({
      type: COMPLETE_WORK_TIMELINE_MILESTONE,
      payload: updateMilestoneApi(timelineId, milestoneId, {
        ...updatedProps,
        status: MILESTONE_STATUS.COMPLETED,
      }).then((completedMilestone) => {
        // When we complete milestone we should copy content of the completed milestone to the next milestone
        // so the next milestone could use it for its own needs
        // TODO $TIMELINE_MILESTONE$ updating of the next milestone could be done in parallel
        // but due to the backend issue https://github.com/topcoder-platform/tc-project-service/issues/162
        // we do in sequentially for now
        if (nextMilestone) {
          // NOTE we wait until the next milestone is also updated before fire COMPLETE_WORK_TIMELINE_MILESTONE_SUCCESS
          const details = {
            ...nextMilestone.details,
            prevMilestoneContent: completedMilestone.details.content,
            prevMilestoneType: completedMilestone.type,
          }
          const isFinishedEnteringDesignForReview = (
            (nextMilestone.type === 'checkpoint-review' || nextMilestone.type === 'final-designs') &&
            completedMilestone.type === 'design-works'
          )
          if (isFinishedEnteringDesignForReview) {
            details.metadata = {
              ..._.get(nextMilestone.details, 'metadata', {}),
              waitingForCustomer: true
            }
          }
          return updateMilestoneApi(timelineId, nextMilestone.id, {
            details
          // always return completedMilestone for COMPLETE_WORK_TIMELINE_MILESTONE
          }).then(() => ({ milestone: completedMilestone }))
        } else {
          // always return completedMilestone for COMPLETE_WORK_TIMELINE_MILESTONE
          return ({ milestone: completedMilestone })
        }
      }),
      meta: {
        workId,
        timelineId,
        milestoneId,
      }
    }).then(() => {
      // reload timeline after completing a milestone,
      // because backend could make cascading updates to the timeline and other milestones
      dispatch(loadWorkTimeline(workId))
    })
  }
}

/**
 * Create several milestones in work timeline
 *
 * @param {Number}        timelineId      timeline id
 * @param {Array<Object>} milestonesToAdd milestones to add
 *
 * @returns {Promise<void>}
 */
function createSeveralMilestones(timelineId, milestonesToAdd) {
  if (milestonesToAdd.length === 0) {
    return Promise.resolve()
  }

  // create milestones one by one
  return createMilestoneApi(timelineId, milestonesToAdd[0]).then(() =>
    createSeveralMilestones(timelineId, milestonesToAdd.slice(1))
  )
}

/**
 * Create several milestones in work timeline using milestone templates.
 *
 * After creating trigger timeline reloading.
 *
 * @param {Function}      dispatch           dispatch
 * @param {Object}        work               work
 * @param {Object}        timeline           timeline
 * @param {Array<Object>} milestoneTemplates list of milestone templates
 *
 * @returns {Promise<void>}
 */
export function createSeveralMilestonesByTemplates(dispatch, work, timeline, milestoneTemplates) {
  const tmpTimeline = _.cloneDeep(timeline)

  const milestonesToAdd = _.sortBy(milestoneTemplates, 'order').map((milestoneTemplate) => {
    const basicProps = _.pick(milestoneTemplate, [
      'name',
      'description',
      'duration',
      'type',
      'plannedText',
      'activeText',
      'completedText',
      'blockedText',
    ])

    const milestoneToAdd = buildMilestoneToCreate(work, tmpTimeline, basicProps)
    // add milestone into temporary timeline, so we can build data for the next milestone as if we already added the previous one
    tmpTimeline.milestones.push(milestoneToAdd)

    return milestoneToAdd
  })

  return createSeveralMilestones(timeline.id, milestonesToAdd).then(() => {
    // reload timeline after creating milestones
    dispatch(loadWorkTimeline(work.id))
  })
}