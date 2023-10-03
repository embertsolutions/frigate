import { h } from 'preact';
import { useRef, useState } from 'preact/hooks';
import Menu from './Menu';
import { ArrowDropdown } from '../icons/ArrowDropdown';
import Heading from './Heading';
import useSWR from 'swr';

export default function SingleSelect({ className, title, options, selection, onToggle }) {
  const popupRef = useRef(null);

  const [state, setState] = useState({
    showMenu: false,
  });

  const isOptionSelected = (item) => {
    if (selection) {
      return selection.split(',').indexOf(item) > -1;
    } else {
      return false;
    }
  };

  const menuHeight = Math.round(window.innerHeight * 0.55);
  const { data: config } = useSWR('config');
  return (
    <div className={`${className} p-2`} ref={popupRef}>
      <div className="flex justify-between min-w-[120px]" onClick={() => setState({ showMenu: true })}>
        <label>{title}</label>
        <ArrowDropdown className="w-6" />
      </div>
      {state.showMenu ? (
        <Menu
          className={`max-h-[${menuHeight}px] overflow-auto`}
          relativeTo={popupRef}
          onDismiss={() => setState({ showMenu: false })}
        >
          <div className="flex flex-wrap justify-between items-center">
            <Heading className="p-4 justify-center" size="md">
              {title}
            </Heading>
          </div>
          {options.map((item) => (
            <div className="flex flex-grow" key={item}>
              <label
                className={`flex flex-shrink space-x-2 p-1 my-1 min-w-[176px] hover:bg-gray-200 dark:hover:bg-gray-800 dark:hover:text-white cursor-pointer capitalize text-sm`}
              >
                <input
                  className="mx-4 m-0 align-middle"
                  type="checkbox"
                  checked={isOptionSelected(item)}
                  onChange={() => onToggle(item)}
                />
                {item.replaceAll('_', ' ')}
              </label>
            </div>
          ))}
        </Menu>
      ) : null}
    </div>
  );
}
