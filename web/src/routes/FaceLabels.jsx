import ActivityIndicator from '../components/ActivityIndicator';
import Heading from '../components/Heading';
import useSWR from 'swr';
import axios from 'axios';
import { useState, useCallback, useMemo } from 'preact/hooks';
import Button from '../components/Button';
import Dialog from '../components/Dialog';
import SingleSelect from '../components/SingleSelect';

export default function Faces({ path, ...props }) {
  const [selectParams, setSelectParams] = useState({
    labels: props.labels ?? 'Not Set',
  });

  const [deleteState, setDeleteState] = useState({
    showDelete: false,
  });

  const { data: config } = useSWR('config');
 
  const { data: allFaceLabels, mutate } = useSWR(['facelabels']);

  const selectFaceValues = useMemo(
    () => ({
      labels: Object.values(allFaceLabels || {}),
    }),
    [allFaceLabels]
  );

  const GetLabelOptions = () => {
    let currentItems = [];

    for (let i = 0; i < selectFaceValues.labels.length; i++) {
      currentItems.push(selectFaceValues.labels[i].label);
    }

    return currentItems;
  };

  const FaceLabelIdFromLabel = (label) => {
    for (let i = 0; i < selectFaceValues.labels.length; i++) {
      if (selectFaceValues.labels[i].label == label) {
        return selectFaceValues.labels[i].id;
      }
    }

    return -1;
  };

  const GetLabelSelection = () => {
    return selectParams.labels;
  };

  const onToggleNamedLabelSelect = (name, item, element) => {
    element.title = item;
    element.selection = item;

    onLabelSelect(name, item);
  };

  const onLabelSelect = useCallback(
    (name, value) => {
      const updatedParams = { ...selectParams, [name]: value };
      setSelectParams(updatedParams);
    },
    [path, selectParams, setSelectParams]
  );

  const onDeleteLabel = async (e, saved) => {
    e.stopPropagation();

    if (saved) {
      setDeleteState({ showDelete: true });
    } else {
      let response;
      response = await axios.delete(`facelabels/${FaceLabelIdFromLabel(selectParams.labels)}/delete`);
      if (response.status === 200) {
        let items;
        let selectedItems = [];
        selectedItems.push('Not Set');
        items = selectedItems.join(',');
        onLabelSelect('labels', items);
        mutate();
      }
    }
  };

  const onAddLabel = async (e) => {
    e.stopPropagation();
    let response;
    const labelElement = document.getElementById('facelabel')
    response = await axios.post(`facelabels/add`, {'label': labelElement.value});
    if (response.status === 200) {
      let items;
      let selectedItems = [];
      selectedItems.push(labelElement.value);
      items = selectedItems.join(',');
      onLabelSelect('labels', items);
      mutate();
    }
  };

  const onChangeLabel = async (e) => {
    e.stopPropagation();
    let response;
    const labelElement = document.getElementById('facelabel')
    response = await axios.put(`facelabels/${FaceLabelIdFromLabel(selectParams.labels)}/change`, {'label': labelElement.value});
    if (response.status === 200) {
      let items;
      let selectedItems = [];
      selectedItems.push(labelElement.value);
      items = selectedItems.join(',');
      onLabelSelect('labels', items);
      mutate();
    }
  };

  if (!config) {
    return <ActivityIndicator />;
  }

  return (
    <div className="space-y-4 p-2 px-4 w-full">
      <Heading>Face Labels</Heading>
      {deleteState.showDelete && (
        <Dialog>
          <div className="p-4">
            <Heading size="lg">Delete Label?</Heading>
            <p className="mb-2">Confirm deletion of label.</p>
          </div>
          <div className="p-2 flex justify-start flex-row-reverse space-x-2">
            <Button
              className="ml-2"
              color="red"
              onClick={(e) => {
                setDeleteState({ ...deleteState, showDelete: false });
                onDeleteLabel(e, false);
              }}
              type="text"
            >
              Delete
            </Button>
          </div>
        </Dialog>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <SingleSelect
          className="basis-1/5 cursor-pointer rounded dark:bg-slate-800"
          title={GetLabelSelection()}
          options={GetLabelOptions()}
          selection={GetLabelSelection()}
          onToggle={(item) => onToggleNamedLabelSelect('labels', item, this)}
        />
        <Button
          className="mx-2"
          onClick={(e) => onDeleteLabel(e, true)}
        >
          Delete
        </Button>
        <input
              id="facelabel" 
              className="basis-1/5 rounded bg-transparent flex justify-between min-w-[120px]"
              type='text'
        />
        <Button
          className="mx-2"
          onClick={(e) => onAddLabel(e)}
        >
          Add
        </Button>
        <Button
          className="mx-2"
          onClick={(e) => onChangeLabel(e)}
        >
          Change
        </Button>
      </div>
    </div>
  );
}
