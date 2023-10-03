import { Fragment } from 'preact';
import { route } from 'preact-router';
import ActivityIndicator from '../components/ActivityIndicator';
import Heading from '../components/Heading';
import { useApiHost } from '../api';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import axios from 'axios';
import { useState, useRef, useCallback, useMemo } from 'preact/hooks';
import { Clock } from '../icons/Clock';
import { Delete } from '../icons/Delete';
import Menu, { MenuItem } from '../components/Menu';
import CalendarIcon from '../icons/Calendar';
import Calendar from '../components/Calendar';
import Button from '../components/Button';
import Dialog from '../components/Dialog';
import MultiSelect from '../components/MultiSelect';
import SingleSelect from '../components/SingleSelect';
import { formatUnixTimestampToDateTime } from '../utils/dateUtil';
import TimeAgo from '../components/TimeAgo';
import Timepicker from '../components/TimePicker';

const API_LIMIT = 25;

const daysAgo = (num) => {
  let date = new Date();
  date.setDate(date.getDate() - num);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000;
};

const monthsAgo = (num) => {
  let date = new Date();
  date.setMonth(date.getMonth() - num);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000;
};

export default function Faces({ path, ...props }) {
  const apiHost = useApiHost();
  const [selectParams, setSelectParams] = useState({
    labels: props.labels ?? 'Not Set',
  });
  const [selectFaceParams, setSelectFaceParams] = useState({
    labels: props.labels,
  });
  const [searchParams, setSearchParams] = useState({
    before: null,
    after: null,
    label_ids: props.label_ids ?? 'all',
  });
  const [state, setState] = useState({
    showDatePicker: false,
    showCalendar: false,
  });

  const [viewEvent, setViewEvent] = useState();

  const [deleteState, setDeleteState] = useState({
    deletingFaceId: null,
    showDelete: false,
  });

  const [importState, setImportState] = useState({
    selectedFiles: null,
  });

  const facesFetcher = useCallback((path, params) => {
    params = { ...params, limit: API_LIMIT };
    return axios.get(path, { params }).then((res) => res.data);
  }, []);

  const getKey = useCallback(
    (index, prevData) => {
      if (index > 0) {
        const lastDate = prevData[prevData.length - 1].capture_time;
        const pagedParams = { ...searchParams, before: lastDate };
        return ['faces', pagedParams];
      }

      return ['faces', searchParams];
    },
    [searchParams]
  );

  const { data: facePages, mutate, size, setSize, isValidating } = useSWRInfinite(getKey, facesFetcher);

  const { data: config } = useSWR('config');
 
  const { data: allFaceLabels } = useSWR(['facelabels']);

  const filterValues = useMemo(
    () => ({
      labels: Object.values(allFaceLabels || {}),
    }),
    [allFaceLabels]
  );

  const FaceLabelIdFromLabel = (label) => {
    for (let i = 0; i < filterValues.labels.length; i++) {
      if (filterValues.labels[i].label === label) {
        return filterValues.labels[i].id;
      }
    }

    return -1;
  };

  const FaceLabelFromLabelId = (labelid) => {
    for (let i = 0; i < filterValues.labels.length; i++) {
      if (filterValues.labels[i].id == labelid) {
        return filterValues.labels[i].label;
      }
    }

    return 'Not Set';
  };

  const onToggleNamedFaceLabelSelect = (name, face, item, element) => {
    let selectedLabelId;
    let oldselectedLabelId;
    selectedLabelId = FaceLabelIdFromLabel(item);
    oldselectedLabelId = face.label_id;
    face.label_id = selectedLabelId;

    element.title = item;
    element.selection = item;

    onFaceLabelSelect(name, face, item);

    if (selectedLabelId != oldselectedLabelId) {
      let response;
      // Why can't we use await?
      response = axios.put(`faces/${face.id}/label`, {'labelid': selectedLabelId});
      if (response.status === 200) {
        mutate();
      }
    }
  };

  const onFaceLabelSelect = useCallback(
    (name, face, value) => {
      const updatedParams = { ...selectFaceParams, [name]: value };
      setSelectFaceParams(updatedParams);
    },
    [path, selectFaceParams, setSelectFaceParams]
  );

  const onDelete = async (e, eventId, saved) => {
    e.stopPropagation();

    if (saved) {
      setDeleteState({ deletingFaceId: eventId, showDelete: true });
    } else {
      const response = await axios.delete(`faces/${eventId}`);
      if (response.status === 200) {
        mutate();
      }
    }
  };


  const GetLabelImportSelection = () => {
    return selectParams.labels;
  };

  const onToggleNamedLabelImportSelect = (name, item, element) => {
    element.title = item;
    element.selection = item;

    onLabelImportSelect(name, item);
  };

  const onLabelImportSelect = useCallback(
    (name, value) => {
      const updatedParams = { ...selectParams, [name]: value };
      setSelectParams(updatedParams);
    },
    [path, selectParams, setSelectParams]
  );


  const GetLabelOptions = () => {
    let currentItems = [];

    for (let i = 0; i < filterValues.labels.length; i++) {
      currentItems.push(filterValues.labels[i].label);
    }

    return currentItems;
  };

  const GetLabelIdOptions = () => {
    let currentItems = [];

    for (let i = 0; i < filterValues.labels.length; i++) {
      currentItems.push(filterValues.labels[i].id.toString());
    }

    return currentItems;
  };

  const GetLabelSelections = () => {
    let items;
    let currentItems = [];

    if (searchParams.label_ids == 'all')
    {
      currentItems.push('all');
    }
    else
    {
      let selections = searchParams.label_ids.length > 0 ? searchParams.label_ids.split(',') : [];

      for (let i = 0; i < selections.length; i++) {
        for (let j = 0; j < filterValues.labels.length; j++) {
          if (selections[i] == filterValues.labels[j].id) {
            currentItems.push(filterValues.labels[j].label);
            break;
          }
        }
      }
    }

    items = currentItems.join(',');

    return items;
  };

  const GetLabelIdSelections = () => {
    let items;
    let currentItems = [];

    let selections = searchParams.label_ids.length > 0 ? searchParams.label_ids.split(',') : [];

    for (let i = 0; i < selections.length; i++) {
      for (let j = 0; j < filterValues.labels.length; j++) {
        if (selections[i] == filterValues.labels[j].id) {
          currentItems.push(filterValues.labels[j].id);
          break;
        }
      }
    }

    items = currentItems.join(',');

    return items;
  };

  const onToggleNamedFilter = (name, item) => {
    let items;
    let toggleitem;

    if (name == 'label_ids') {
      for (let i = 0; i < filterValues.labels.length; i++) {
        if (filterValues.labels[i].label == item) {
          toggleitem = filterValues.labels[i].id.toString();
          break;
        }
      }
    }
    else{
      toggleitem = item;
    }

    if (searchParams[name] == 'all') {
      let currentItems;

      if (name == 'label_ids') {
        currentItems = GetLabelIdOptions();
      }
      else {
        currentItems = Array.from(filterValues[name]);
      }

      // don't remove all if only one option
      if (currentItems.length > 1) {
        currentItems.splice(currentItems.indexOf(toggleitem), 1);
        items = currentItems.join(',');
      } else {
        items = ['all'];
      }
    } else {
      let currentItems;
      if (name == 'label_ids') {
        let labelselections = GetLabelIdSelections();
        currentItems = labelselections.length > 0 ? labelselections.split(',') : [];
      }
      else {
        currentItems = searchParams[name].length > 0 ? searchParams[name].split(',') : [];
      }

      if (currentItems.includes(toggleitem)) {
        // don't remove the last item in the filter list
        if (currentItems.length > 1) {
          currentItems.splice(currentItems.indexOf(toggleitem), 1);
        }

        items = currentItems.join(',');
      } else if (name == 'label_ids') {
        if (currentItems.length + 1 == GetLabelIdOptions().length) {
          items = ['all'];
        } else {
          currentItems.push(toggleitem);
          items = currentItems.join(',');
        }
      } else {
        if (currentItems.length + 1 == filterValues[name].length) {
          items = ['all'];
        } else {
          currentItems.push(toggleitem);
          items = currentItems.join(',');
        }
      }
    }
    onFilter(name, items);
  };

  const datePicker = useRef();

  const handleSelectDateRange = useCallback(
    (dates) => {
      setSearchParams({ ...searchParams, before: dates.before, after: dates.after });
      setState({ ...state, showDatePicker: false });
    },
    [searchParams, setSearchParams, state, setState]
  );

  const onFilter = useCallback(
    (name, value) => {
      const updatedParams = { ...searchParams, [name]: value };
      setSearchParams(updatedParams);
      const queryString = Object.keys(updatedParams)
        .map((key) => {
          if (updatedParams[key] && updatedParams[key] != 'all') {
            return `${key}=${updatedParams[key]}`;
          }
          return null;
        })
        .filter((val) => val)
        .join('&');
      route(`${path}?${queryString}`);
    },
    [path, searchParams, setSearchParams]
  );

  const isDone = (facePages?.[facePages.length - 1]?.length ?? 0) < API_LIMIT;

  // hooks for infinite scroll
  const observer = useRef();
  const lastEventRef = useCallback(
    (node) => {
      if (isValidating) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isDone) {
          setSize(size + 1);
        }
      });
      if (node) observer.current.observe(node);
    },
    [size, setSize, isValidating, isDone]
  );

  const onStartCapture = async (e) => {
    e.stopPropagation();

    let response;
    response = await axios.post(`faces/startcapture`);
  };

  const onStopCapture = async (e) => {
    e.stopPropagation();

    let response;
    response = await axios.post(`faces/stopcapture`);
  };

  const onFileChange = event => {
    setImportState({ selectedFiles: event.target.files });
  };

  const onImport = async (e) => {
    e.stopPropagation();

    if (importState.selectedFiles.length == 0) {
      return;
    }

    for (let i = 0; i < importState.selectedFiles.length; i++) {
      const formData = new FormData();

      formData.append(
          "myFile",
          importState.selectedFiles[i],
          importState.selectedFiles[i].name
      );
  
      console.log(importState.selectedFiles[i]);
  
      let response;
      response = await axios.post(`faces/${FaceLabelIdFromLabel(selectParams.labels)}/import`, formData);
      if (response.status === 200) {
        mutate();
      }  
    }
  };

  const onRefresh = async (e) => {
    e.stopPropagation();

    mutate();
  };

  const onForceRetrain = async (e) => {
    e.stopPropagation();

    let response;
    response = await axios.post(`faces/forceretrain`);
  };

  if (!config) {
    return <ActivityIndicator />;
  }

  return (
    <div className="space-y-4 p-2 px-4 w-full">
      <Heading>Faces</Heading>
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          className="mx-2"
          onClick={(e) => onStartCapture(e)}
        >
          Start Capture
        </Button>
        <Button
          className="mx-2"
          onClick={(e) => onStopCapture(e)}
        >
          Stop Capture
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <SingleSelect
          className="basis-1/5 cursor-pointer rounded dark:bg-slate-800"
          title={GetLabelImportSelection()}
          options={GetLabelOptions()}
          selection={GetLabelImportSelection()}
          onToggle={(item) => onToggleNamedLabelImportSelect('labels', item, this)}
        />
        <input type="file" accept="image/*" multiple onChange={onFileChange} />
        <Button
          className="mx-2"
          onClick={(e) => onImport(e)}
        >
          Import
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          className="mx-2"
          onClick={(e) => onRefresh(e)}
        >
          Refresh
        </Button>
        <Button
          className="mx-2"
          onClick={(e) => onForceRetrain(e)}
        >
          Force Retrain
        </Button>
      </div>
      {deleteState.showDelete && (
        <Dialog>
          <div className="p-4">
            <Heading size="lg">Delete Face?</Heading>
            <p className="mb-2">Confirm deletion of face.</p>
          </div>
          <div className="p-2 flex justify-start flex-row-reverse space-x-2">
            <Button
              className="ml-2"
              color="red"
              onClick={(e) => {
                setDeleteState({ ...deleteState, showDelete: false });
                onDelete(e, deleteState.deletingFaceId, false);
              }}
              type="text"
            >
              Delete
            </Button>
          </div>
        </Dialog>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <MultiSelect
          className="basis-1/5 cursor-pointer rounded dark:bg-slate-800"
          title="Labels"
          options={GetLabelOptions()}
          selection={GetLabelSelections()}
          onToggle={(item) => onToggleNamedFilter('label_ids', item)}
          onShowAll={() => onFilter('label_ids', ['all'])}
        />
        <div ref={datePicker} className="ml-right">
          <CalendarIcon
            className="h-8 w-8 cursor-pointer"
            onClick={() => setState({ ...state, showDatePicker: true })}
          />
        </div>
      </div>
      {state.showDatePicker && (
        <Menu
          className="rounded-t-none"
          onDismiss={() => setState({ ...state, setShowDatePicker: false })}
          relativeTo={datePicker}
        >
          <MenuItem label="All" value={{ before: null, after: null }} onSelect={handleSelectDateRange} />
          <MenuItem label="Today" value={{ before: null, after: daysAgo(0) }} onSelect={handleSelectDateRange} />
          <MenuItem
            label="Yesterday"
            value={{ before: daysAgo(0), after: daysAgo(1) }}
            onSelect={handleSelectDateRange}
          />
          <MenuItem label="Last 7 Days" value={{ before: null, after: daysAgo(7) }} onSelect={handleSelectDateRange} />
          <MenuItem label="This Month" value={{ before: null, after: monthsAgo(0) }} onSelect={handleSelectDateRange} />
          <MenuItem
            label="Last Month"
            value={{ before: monthsAgo(0), after: monthsAgo(1) }}
            onSelect={handleSelectDateRange}
          />
          <MenuItem
            label="Custom Range"
            value="custom"
            onSelect={() => {
              setState({ ...state, showCalendar: true, showDatePicker: false });
            }}
          />
        </Menu>
      )}

      {state.showCalendar && (
        <span>
          <Menu
            className="rounded-t-none"
            onDismiss={() => setState({ ...state, showCalendar: false })}
            relativeTo={datePicker}
          >
            <Calendar
              onChange={handleSelectDateRange}
              dateRange={{ before: searchParams.before * 1000 || null, after: searchParams.after * 1000 || null }}
              close={() => setState({ ...state, showCalendar: false })}
            >
              <Timepicker
                dateRange={{ before: searchParams.before * 1000 || null, after: searchParams.after * 1000 || null }}
                onChange={handleSelectDateRange}
              />
            </Calendar>
          </Menu>
        </span>
      )}
      <div className="space-y-2">
        {facePages ? (
          facePages.map((page, i) => {
            const lastPage = facePages.length === i + 1;
            return page.map((face, j) => {
              const lastEvent = lastPage && page.length === j + 1;
              return (
                <Fragment key={face.id}>
                  <div
                    ref={lastEvent ? lastEventRef : false}
                    className="flex bg-slate-100 dark:bg-slate-800 rounded cursor-pointer min-w-[330px]"
                    onClick={() => (viewEvent === face.id ? setViewEvent(null) : setViewEvent(face.id))}
                  >
                    <div
                      className="relative rounded-l flex-initial min-w-[125px] h-[125px] bg-contain bg-no-repeat bg-center"
                      style={{
                        'background-image': `url(${apiHost}/api/faces/${face.id}/thumbnail.jpg)`,
                      }}
                    >
                    </div>
                    <div
                      className="relative rounded-l flex-initial min-w-[125px] h-[125px] bg-contain bg-no-repeat bg-center"
                      style={{
                        'background-image': `url(${apiHost}/api/faces/${face.id}/dectector_thumbnail.jpg)`,
                      }}
                    >
                    </div>
                    <div className="m-2 flex grow">
                      <div className="flex flex-col grow">
                        <div className="capitalize text-lg font-bold">
                          {face.id ? face.id : ""}
                        </div>
                        <SingleSelect
                          className="basis-1/5 cursor-pointer rounded dark:bg-slate-800"
                          title={FaceLabelFromLabelId(face.label_id)}
                          options={GetLabelOptions()}
                          selection={FaceLabelFromLabelId(face.label_id)}
                          onToggle={(item) => onToggleNamedFaceLabelSelect('labels', face, item, this)}
                        />
                        <div className="text-sm flex">
                          <Clock className="h-5 w-5 mr-2 inline" />
                          {formatUnixTimestampToDateTime(face.capture_time, { ...config.ui })}
                          <div className="hidden md:inline">
                            <span className="m-1">-</span>
                            <TimeAgo time={face.capture_time * 1000} dense />
                          </div>
                        </div>
                      </div>
                      <div class="hidden sm:flex flex-col justify-end mr-2">
                      </div>
                      <div class="flex flex-col">
                        <Delete
                          className="h-6 w-6 cursor-pointer"
                          stroke="#f87171"
                          onClick={(e) => onDelete(e, face.id, true)}
                        />
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            });
          })
        ) : (
          <ActivityIndicator />
        )}
      </div>
      <div>{isDone ? null : <ActivityIndicator />}</div>
    </div>
  );
}
