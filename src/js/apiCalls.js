/**
 * Communicate with GitHub API
 */

'use strict';

import base64 from './base64';
import { getLoginInfo, validateKind } from './dataValidation';

/**
 * Encode authentication info for HTTP requests
 * @param {Object} loginInfo
 * @return {string}
 */
const makeBasicAuth = (loginInfo) =>
  'Basic ' +
  base64.encode(
    `${loginInfo.gitHubUsername}:` + `${loginInfo.personalAccessToken}`
  );

/**
 * Write logs inside modal #committing-modal when committing changes
 * @param {string} string
 */
const writeLog = (string) => {
  const logNode = document.createElement('p');
  logNode.innerHTML = string;
  const modalNode = document.querySelector('#committing-modal .modal-body');
  modalNode.appendChild(logNode);
  return;
};

/**
 * Format data from an HTML node element
 * @param {HTMLElement} node
 * @return {string | null}
 */
const formatDate = (node) => {
  const date = node.value;
  const time = node.getAttribute('data-orig-time');

  if (!date) {
    return null;
  }

  const dt = {};
  [dt.year, dt.month, dt.dayOfMonth] = date.split('-').map((e) => +e);
  [dt.hour, dt.minute, dt.second] = time ? time.split(':') : [0, 0, 0];

  const dateObject = new Date(
    dt.year,
    dt.month - 1,
    dt.dayOfMonth,
    dt.hour,
    dt.minute,
    dt.second
  );

  return dateObject.toISOString().replace('.000Z', 'Z');
};

/**
 * Serialize entries for HTTP requests
 * @param {HTMLElement} node
 * @param {string} kind
 * @return {Object | null} Serialized object
 */
const serializeEntry = (node, kind) => {
  try {
    validateKind(kind);
  } catch (err) {
    console.error(err);
    alert(err);
    return;
  }

  if (kind === 'labels') {
    return {
      name: node.querySelector('[name="name"]').value,
      originalName: node
        .querySelector('[name="name"]')
        .getAttribute('data-orig-val'),
      color: node.querySelector('[name="color"]').value.slice(1),
      description: node.querySelector('[name="description"]').value,
    };
  } else {
    // milestones
    if (node.getAttribute('data-number') !== 'null') {
      return {
        title: node.querySelector('[name="title"]').value,
        originalTitle: node
          .querySelector('[name="title"]')
          .getAttribute('data-orig-val'),
        state: node.querySelector('[name="state"]').value,
        description: node.querySelector('[name="description"]').value,
        due_on: formatDate(node.querySelector('[name="due-date"]')),
        number: +node.getAttribute('data-number'),
      };
    } else {
      if (node.querySelector('[name="due-date"]').value !== '') {
        return {
          title: node.querySelector('[name="title"]').value,
          state: node.querySelector('[name="state"]').value,
          description: node.querySelector('[name="description"]').value,
          due_on: formatDate(node.querySelector('[name="due-date"]')),
        };
      } else {
        return {
          title: node.querySelector('[name="title"]').value,
          state: node.querySelector('[name="state"]').valie,
          description: node.querySelector('[name="description"]').value,
        };
      }
    }
  }
};

/**
 * Pack an entry with serialized data and various information for convenience
 * @param {Object} serializedEntry
 * @param {string} kind
 * @return {Object}
 */
const packEntry = (serializedEntry, kind) => {
  const entryObjectCopy = serializedEntry; // Avoid side effects
  const entryPackage = {};

  if (kind === 'labels') {
    entryPackage.originalName = entryObjectCopy.originalName;
    entryPackage.newName = entryObjectCopy.name;
    entryPackage.apiCallSign = entryObjectCopy.originalName;
    delete entryObjectCopy.originalName;
  } else {
    // Milestone
    entryPackage.originalName = entryObjectCopy.originalTitle;
    entryPackage.newName = entryObjectCopy.title;
    entryPackage.apiCallSign = entryObjectCopy.number;
    delete entryObjectCopy.originalTitle;
  }

  return {
    body: entryObjectCopy,
    names: entryPackage,
  };
};

/**
 * Throw error message when HTTP request fails
 * @param {Object} response
 * @return {string}
 */
const composeStatusMessage = (response) => {
  if (response.ok) {
    return `${response.status} status OK.`;
  }
  if (response.status === 401) {
    return (
      `${response.status} ${response.statusText}.` +
      ' Please check the input values of your login information.'
    );
  }
  if (response.status === 403) {
    return (
      `${response.status} ${response.statusText}.` +
      ' The GitHub server refused to your request.' +
      ' Maybe you have exceeded your rate limit.' +
      ' Please wait for a little while.'
    );
  }
  if (response.status === 404) {
    return (
      `${response.status} ${response.statusText}.` +
      ' Repository not found. Please check the input values of your' +
      ' login information.'
    );
  }
  return `${response.status} ${response.statusText}.` + ` Error occurred.`;
};

/**
 * Returns a HTTP request URL for getting entries from a repository
 * @param {Object} loginInfo
 * @param {string} kind
 * @param {number} pageNum
 * @param {string} mode
 * @return {string}
 */
const urlForGet = (loginInfo, kind, pageNum, mode = 'list') => {
  const owner =
    mode === 'list' ? loginInfo.homeRepoOwner : loginInfo.templateRepoOwner;
  const repo =
    mode === 'list' ? loginInfo.homeRepoName : loginInfo.templateRepoName;
  let url =
    'https://api.github.com/repos/' +
    `${owner}/${repo}/${kind}` +
    `?per_page=20` +
    `&page=${pageNum}`;

  if (kind === 'milestones') {
    url += '&state=all';
  }
  return url;
};

/**
 * Returns a Fetch API promise for getting entries
 * @param {function} getUrl
 * @param {Object} loginInfo
 * @param {string} kind
 * @param {number} pageNum
 * @param {string} mode
 * @return {Promise}
 */
const fetchGet = (getUrl, loginInfo, kind, pageNum, mode) =>
  fetch(getUrl(loginInfo, kind, pageNum, mode), {
    method: 'GET',
    headers: {
      Authorization: makeBasicAuth(loginInfo),
      Accept: 'application/vnd.github.v3+json',
    },
  });

/**
 * Get entries recursively because there might be multiple pages
 * @param {Object} loginInfo
 * @param {string} kind
 * @param {number} pageNum
 * @param {string} mode
 * @return {Promise}
 */
const apiCallGet = (loginInfo, kind, pageNum = 1, mode = 'list') =>
  new Promise((resolve, reject) => {
    pageNum = pageNum === 1 ? 1 : pageNum;

    fetchGet(urlForGet, loginInfo, kind, pageNum, mode)
      .then((response) => {
        if (!response.ok) {
          throw new Error(composeStatusMessage(response));
        }
        return response.json();
      })
      .then(async (body) => {
        if (body.length === 0) {
          if (pageNum === 1) {
            const msg = `No ${kind} exist in this repository.`;
            reject(msg);
            return;
          }
          resolve(body);
          return;
        }

        resolve(
          body.concat(await apiCallGet(loginInfo, kind, ++pageNum, mode))
        );
        return;
      })
      .catch((err) => {
        alert(err);
        console.error(err);
        reject(err);
        return;
      });
  });

/**
 * Returns a HTTP request URL for creating entries
 * @param {Object} loginInfo
 * @param {string} kind
 * @return {string}
 */
const urlForCreate = (loginInfo, kind) =>
  `https://api.github.com/repos/${loginInfo.homeRepoOwner}/` +
  `${loginInfo.homeRepoName}/${kind}`;

/**
 * Return a Fetch API promise for creating entries
 * @param {function} getUrl
 * @param {Object} loginInfo
 * @param {string} kind
 * @param {Object} entryPackage
 * @return {Promise}
 */
const fetchCreate = (getUrl, loginInfo, kind, entryPackage) =>
  fetch(getUrl(loginInfo, kind), {
    method: 'POST',
    headers: {
      Authorization: makeBasicAuth(loginInfo),
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify(entryPackage.body),
  });

/**
 * Make API calls to create entries and parse responses
 * @param {HTMLElement} entryNode
 * @param {string} kind
 * @return {Promise}
 */
const apiCallCreate = (entryNode, kind) => {
  try {
    validateKind(kind);
  } catch (err) {
    writeLog(err);
    return;
  }

  const loginInfo = getLoginInfo();
  const serializedEntry = serializeEntry(entryNode, kind);
  const entryPackage = packEntry(serializedEntry, kind);
  const kindSingular = kind.slice(0, -1);

  return fetchCreate(urlForCreate, loginInfo, kind, entryPackage)
    .then((response) => {
      if (!response.ok) {
        composeStatusMessage(response);
      }
    })
    .then(() => {
      writeLog(`Created ${kindSingular}: ${entryPackage.names.newName}.`);
    })
    .catch((err) => {
      writeLog(
        `Creation of ${kindSingular} ${entryPackage.names.newName}` +
          ` failed due to error: ${err}.`
      );
      console.error(err);
    });
};

/**
 * Return a URL for updating entries
 * @param {Object} loginInfo
 * @param {string} kind
 * @param {string} apiCallSign
 * @return {string}
 */
const urlForUpdate = (loginInfo, kind, apiCallSign) =>
  `https://api.github.com/repos/${loginInfo.homeRepoOwner}/` +
  `${loginInfo.homeRepoName}/${kind}/${apiCallSign}`;

/**
 * Returns a Fetch API promise for updating entries
 * @param {function} getUrl
 * @param {Object} loginInfo
 * @param {string} kind
 * @param {Object} entryPackage
 * @return {Promise}
 */
const fetchUpdate = (getUrl, loginInfo, kind, entryPackage) =>
  fetch(getUrl(loginInfo, kind, entryPackage.names.apiCallSign), {
    method: 'PATCH',
    headers: {
      Authorization: makeBasicAuth(loginInfo),
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify(entryPackage.body),
  });

/**
 * Make API calls to update entries
 * @param {HTMLElement} entryNode
 * @param {string} kind
 * @return {Promise}
 */
const apiCallUpdate = (entryNode, kind) => {
  try {
    validateKind(kind);
  } catch (err) {
    writeLog(err);
    return;
  }

  const loginInfo = getLoginInfo();
  const serializedEntry = serializeEntry(entryNode, kind);
  const entryPackage = packEntry(serializedEntry, kind);
  const kindSingular = kind.slice(0, -1);

  return fetchUpdate(urlForUpdate, loginInfo, kind, entryPackage)
    .then((response) => {
      if (!response.ok) {
        composeStatusMessage(response);
      }
    })
    .then(() => {
      writeLog(
        `Updated ${kindSingular}: ${entryPackage.names.originalName}` +
          ` &#8680; ${entryPackage.names.newName}.`
      );
    })
    .catch((err) => {
      writeLog(
        `Update of ${kindSingular} ${entryPackage.names.originalName}` +
          ` &#8680; ${entryPackage.names.newName} failed due to error: ${err}.`
      );
      console.error(err);
    });
};

/**
 * Return a URL for deleting entries
 * @param {Object} loginInfo
 * @param {string} kind
 * @param {string} apiCallSign
 * @return {string}
 */
const urlForDelete = (loginInfo, kind, apiCallSign) =>
  `https://api.github.com/repos/${loginInfo.homeRepoOwner}/` +
  `${loginInfo.homeRepoName}/${kind}/${apiCallSign}`;

/**
 * Return a Fetch promise for deleting entries
 * @param {function} getUrl
 * @param {Object} loginInfo
 * @param {string} kind
 * @param {Object} entryPackage
 * @return {Promise}
 */
const fetchDelete = (getUrl, loginInfo, kind, entryPackage) =>
  fetch(getUrl(loginInfo, kind, entryPackage.names.apiCallSign), {
    method: 'DELETE',
    headers: {
      Authorization: makeBasicAuth(loginInfo),
      Accept: 'application/vnd.github.v3+json',
    },
  });

/**
 * Make API calls to delete entries
 * @param {HTMLElement} entryNode
 * @param {string} kind
 * @return {Promise}
 */
const apiCallDelete = (entryNode, kind) => {
  try {
    validateKind(kind);
  } catch (err) {
    writeLog(err);
    return;
  }

  const loginInfo = getLoginInfo();
  const serializedEntry = serializeEntry(entryNode, kind);
  const entryPackage = packEntry(serializedEntry, kind);
  const kindSingular = kind.slice(0, -1);

  return fetchDelete(urlForDelete, loginInfo, kind, entryPackage)
    .then((response) => {
      if (!response.ok) {
        composeStatusMessage(response);
      }
      writeLog(`Deleted ${kindSingular}: ${entryPackage.names.originalName}.`);
    })
    .catch((err) => {
      writeLog(
        `Deletion of ${kindSingular} ${entryPackage.names.originalName} ` +
          `failed due to error: ${err}.`
      );
      console.error(err);
    });
};

export {
  makeBasicAuth,
  writeLog,
  formatDate,
  serializeEntry,
  packEntry,
  composeStatusMessage,
  urlForGet,
  fetchGet,
  apiCallGet,
  urlForCreate,
  fetchCreate,
  apiCallCreate,
  urlForUpdate,
  fetchUpdate,
  apiCallUpdate,
  urlForDelete,
  fetchDelete,
  apiCallDelete,
};