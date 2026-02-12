const formField = [
    {
        name: 'platform',
        label: 'Platform',
        type: 'selection',
        placeholder: 'Select a platform',
        required: true,
        value: ''
    },
    {
        name: 'version',
        label: 'Version',
        type: 'text',
        placeholder: 'Enter a app version',
        required: true,
        value: ''
    },
    {
        name: 'isActive',
        label: 'Is this active version for this platform?',
        type: 'checkbox',
        placeholder: '',
        required: true,
        value: ''
    },
    {
        name: 'releaseDate',
        label: 'Release Date',
        type: 'date',
        placeholder: 'Select a release date',
        required: true,
        value: ''
    }
]

export default formField