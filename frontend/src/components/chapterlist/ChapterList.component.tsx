import {
  Box,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Grid,
  List,
  ListItem
} from '@mui/material'
import { ChangeEvent } from 'react'
import { Chapter } from '../../tools/responses/api.interface'

interface IListProps {
  chapterList: Chapter[]
  onCheck: (event: ChangeEvent, checked: boolean) => void
}

export default function ChapterListComponent(props: IListProps): JSX.Element {
  return (
    <List>
      {props.chapterList.map((chapter, index) => {
        return (
          <Box
            sx={{ display: 'flex', alignItems: 'center', mb: '15px' }}
            key={index}
          >
            <ListItem divider={true}>
              <Grid alignItems="center" container spacing={2}>
                <Grid item xs={12} md={8}>
                  <FormGroup>
                    <FormControlLabel
                      label={chapter.title}
                      control={
                        <Checkbox
                          name={index.toString()}
                          color="primary"
                          checked={chapter.checked}
                          onChange={props.onCheck}
                        />
                      }
                    ></FormControlLabel>
                  </FormGroup>
                </Grid>

                <Grid item xs={8} md={3}>
                  {chapter.author}
                </Grid>

                <Grid item xs={4} md={1}>
                  {chapter.date}
                </Grid>
              </Grid>
            </ListItem>
          </Box>
        )
      })}
    </List>
  )
}
